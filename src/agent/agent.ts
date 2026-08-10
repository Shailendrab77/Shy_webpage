import OpenAI from 'openai';
import { env, isOpenAiConfigured } from '../config/env.js';
import type { AgentExtraction, ConversationState } from '../database/types.js';
import { agentExtractionSchema } from './schemas.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { parseAmount, parseCustomerId, parseRequestCode } from '../utils/amountParser.js';
import { maskPhoneNumber } from '../utils/phone.js';
import { logger } from '../utils/logger.js';
import { ExternalServiceError } from '../utils/errors.js';

export interface AgentDependencies {
  openai?: OpenAI;
}

/**
 * AI agent that ONLY extracts structured information.
 * All side effects (Sheets writes, approvals) happen in deterministic backend code.
 */
export class PayoutAgent {
  private readonly openai: OpenAI | null;

  constructor(deps: AgentDependencies = {}) {
    if (deps.openai) {
      this.openai = deps.openai;
    } else if (isOpenAiConfigured()) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
      });
    } else {
      this.openai = null;
    }
  }

  async extract(params: {
    message: string;
    whatsappNumber: string;
    conversation: ConversationState | null;
  }): Promise<AgentExtraction> {
    const conversation = {
      collectedCustomerId: params.conversation?.collectedCustomerId ?? null,
      collectedAmount: params.conversation?.collectedAmount ?? null,
      pendingIntent: params.conversation?.pendingIntent ?? null,
      lastRequestCode: params.conversation?.lastRequestCode ?? null,
    };

    if (env.LLM_PROVIDER === 'heuristic' || !this.openai) {
      return this.heuristicExtract(params.message, conversation);
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildUserPrompt({
              message: params.message,
              whatsappNumberMasked: maskPhoneNumber(params.whatsappNumber),
              conversation,
            }),
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new ExternalServiceError('OpenAI', 'Empty completion content');
      }

      const parsedJson = JSON.parse(content) as unknown;
      const validated = agentExtractionSchema.safeParse(parsedJson);
      if (!validated.success) {
        logger.warn({ issues: validated.error.issues }, 'LLM output failed Zod validation; falling back');
        return this.heuristicExtract(params.message, conversation);
      }

      return {
        intent: validated.data.intent,
        customerId: validated.data.customerId ?? null,
        amount: validated.data.amount ?? null,
        requestCode: validated.data.requestCode ?? null,
        missingFields: validated.data.missingFields,
        confidence: validated.data.confidence,
        clarificationNeeded: validated.data.clarificationNeeded,
        rawNotes: validated.data.rawNotes,
      };
    } catch (error) {
      logger.error({ err: error }, 'LLM extraction failed; using heuristic fallback');
      return this.heuristicExtract(params.message, conversation);
    }
  }

  /**
   * Deterministic fallback / test mode extractor.
   * Still returns the same structured shape validated by Zod.
   */
  heuristicExtract(
    message: string,
    conversation: {
      collectedCustomerId: string | null;
      collectedAmount: number | null;
      pendingIntent: string | null;
      lastRequestCode: string | null;
    },
  ): AgentExtraction {
    const text = message.trim();
    const lower = text.toLowerCase();
    const amount = parseAmount(text);
    const customerId = parseCustomerId(text);
    const requestCode = parseRequestCode(text, env.REQUEST_CODE_PREFIX);

    let intent: AgentExtraction['intent'] = 'unknown';

    if (/\b(help|how does|what can you)\b/i.test(text)) {
      intent = 'help';
    } else if (/\b(cancel|abort|stop)\b/i.test(text)) {
      intent = 'cancel_request';
    } else if (/\b(status|track|check|where is|progress)\b/i.test(text) || (requestCode && /\b(pay-)\b/i.test(lower))) {
      intent = 'payout_status';
    } else if (
      /\b(payout|withdraw|withdrawal|request|need|want|get|send)\b/i.test(text) ||
      (amount !== null && conversation.pendingIntent === 'payout_request')
    ) {
      intent = 'payout_request';
    } else if (customerId && !amount && conversation.pendingIntent) {
      intent = 'provide_customer_id';
    } else if (amount !== null && !customerId && conversation.pendingIntent) {
      intent = 'provide_amount';
    } else if (amount !== null || customerId) {
      intent = conversation.pendingIntent === 'payout_status' ? 'payout_status' : 'payout_request';
    } else if (requestCode) {
      intent = /\bcancel\b/i.test(lower) ? 'cancel_request' : 'payout_status';
    }

    // If user only sent a bare amount/id while collecting, refine intent.
    if (conversation.pendingIntent === 'payout_request') {
      if (amount !== null && !/\b(status|cancel)\b/i.test(text)) {
        intent = amount && customerId ? 'payout_request' : amount ? 'provide_amount' : intent;
      }
      if (customerId && amount === null) {
        intent = 'provide_customer_id';
      }
      if (amount !== null && customerId) {
        intent = 'payout_request';
      }
      if (amount !== null && !customerId && !/\b(status|cancel|help)\b/i.test(text)) {
        intent = conversation.collectedCustomerId ? 'payout_request' : 'provide_amount';
      }
    }

    const missingFields: AgentExtraction['missingFields'] = [];
    const effectiveAmount = amount ?? conversation.collectedAmount;
    const effectiveCustomerId = customerId ?? conversation.collectedCustomerId;

    if (intent === 'payout_request' || intent === 'provide_amount' || intent === 'provide_customer_id') {
      if (effectiveAmount === null) missingFields.push('amount');
      if (effectiveCustomerId === null) missingFields.push('customerId');
    }
    if ((intent === 'payout_status' || intent === 'cancel_request') && !requestCode && !conversation.lastRequestCode) {
      // request code optional if we can look up by customer; only mark missing when clearly needed
      if (/\b(pay-|code)\b/i.test(lower) || intent === 'cancel_request') {
        if (!requestCode) missingFields.push('requestCode');
      }
    }

    const extraction: AgentExtraction = {
      intent,
      customerId,
      amount,
      requestCode,
      missingFields,
      confidence: intent === 'unknown' ? 0.3 : 0.85,
      clarificationNeeded: missingFields.length > 0 && intent === 'payout_request' && amount === null && !customerId,
    };

    const validated = agentExtractionSchema.parse(extraction);
    return {
      intent: validated.intent,
      customerId: validated.customerId ?? null,
      amount: validated.amount ?? null,
      requestCode: validated.requestCode ?? null,
      missingFields: validated.missingFields,
      confidence: validated.confidence,
      clarificationNeeded: validated.clarificationNeeded,
      rawNotes: validated.rawNotes,
    };
  }
}
