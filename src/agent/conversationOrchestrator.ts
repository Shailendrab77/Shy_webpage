import { randomUUID } from 'node:crypto';
import type {
  ConversationState,
  IncomingWhatsAppMessage,
  ProcessMessageResult,
} from '../database/types.js';
import type { ConversationStore, IdempotencyStore } from '../repositories/interfaces.js';
import { PayoutAgent } from './agent.js';
import { PayoutService } from '../payout/payoutService.js';
import { CustomerMessages } from '../payout/messages.js';
import { childLogger } from '../utils/logger.js';
import { getCustomerSafeMessage } from '../utils/errors.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';
import { nowIso } from '../utils/time.js';

/**
 * Orchestrates: message → AI extraction → deterministic backend actions → reply.
 * The LLM never writes to Google Sheets or decides approval.
 */
export class ConversationOrchestrator {
  constructor(
    private readonly agent: PayoutAgent,
    private readonly payoutService: PayoutService,
    private readonly conversationStore: ConversationStore,
    private readonly idempotencyStore: IdempotencyStore,
  ) {}

  async processMessage(message: IncomingWhatsAppMessage): Promise<ProcessMessageResult> {
    const correlationId = message.conversationId ?? randomUUID();
    const phone = normalizeWhatsAppNumber(message.from);
    const log = childLogger({
      correlationId,
      messageId: message.messageId,
      phoneMasked: phone.slice(-4),
    });

    log.info({ textLength: message.text.length }, 'Incoming WhatsApp message');

    // Idempotency for webhook retries / duplicate deliveries.
    if (await this.idempotencyStore.has(message.messageId)) {
      const meta = await this.idempotencyStore.getMeta(message.messageId);
      log.info('Duplicate WhatsApp message ignored');
      return {
        reply:
          typeof meta?.reply === 'string'
            ? meta.reply
            : CustomerMessages.alreadyProcessed,
        correlationId,
        createdRequestCode:
          typeof meta?.requestCode === 'string' ? meta.requestCode : undefined,
        skippedDuplicate: true,
      };
    }

    try {
      const existingState = await this.conversationStore.get(phone);
      const extraction = await this.agent.extract({
        message: message.text,
        whatsappNumber: phone,
        conversation: existingState,
      });

      log.info(
        {
          intent: extraction.intent,
          confidence: extraction.confidence,
          hasAmount: extraction.amount !== null,
          hasCustomerId: Boolean(extraction.customerId),
          hasRequestCode: Boolean(extraction.requestCode),
          missingFields: extraction.missingFields,
        },
        'Agent intent extracted',
      );

      const state = this.mergeConversationState(existingState, phone, correlationId, extraction);
      await this.conversationStore.save(state);

      const result = await this.dispatch({
        extraction,
        state,
        message,
        correlationId,
        phone,
      });

      // Update conversation after successful actions.
      if (result.createdRequestCode) {
        state.lastRequestCode = result.createdRequestCode;
        state.collectedAmount = null;
        state.collectedCustomerId = null;
        state.pendingIntent = null;
        state.updatedAt = nowIso();
        await this.conversationStore.save(state);
      }

      await this.idempotencyStore.mark(message.messageId, {
        reply: result.reply,
        requestCode: result.createdRequestCode,
        correlationId,
      });

      log.info(
        { requestCode: result.createdRequestCode },
        'WhatsApp response prepared',
      );

      return result;
    } catch (error) {
      log.error({ err: error }, 'Failed to process WhatsApp message');
      const reply = getCustomerSafeMessage(error);
      // Mark processed to avoid duplicate side effects on retry after partial success.
      // If creation happened before failure, repository message-id check still protects.
      await this.idempotencyStore.mark(message.messageId, {
        reply,
        correlationId,
        error: true,
      });
      return { reply, correlationId };
    }
  }

  private mergeConversationState(
    existing: ConversationState | null,
    phone: string,
    conversationId: string,
    extraction: Awaited<ReturnType<PayoutAgent['extract']>>,
  ): ConversationState {
    const now = nowIso();
    const base: ConversationState = existing ?? {
      conversationId,
      whatsappNumber: phone,
      collectedCustomerId: null,
      collectedAmount: null,
      pendingIntent: null,
      lastRequestCode: null,
      createdAt: now,
      updatedAt: now,
    };

    if (extraction.customerId) {
      base.collectedCustomerId = extraction.customerId;
    }
    if (extraction.amount !== null) {
      base.collectedAmount = extraction.amount;
    }
    if (extraction.requestCode) {
      base.lastRequestCode = extraction.requestCode;
    }

    if (
      extraction.intent === 'payout_request' ||
      extraction.intent === 'provide_amount' ||
      extraction.intent === 'provide_customer_id'
    ) {
      base.pendingIntent = 'payout_request';
    } else if (extraction.intent === 'payout_status' || extraction.intent === 'cancel_request') {
      base.pendingIntent = extraction.intent;
    }

    base.updatedAt = now;
    return base;
  }

  private async dispatch(params: {
    extraction: Awaited<ReturnType<PayoutAgent['extract']>>;
    state: ConversationState;
    message: IncomingWhatsAppMessage;
    correlationId: string;
    phone: string;
  }): Promise<ProcessMessageResult> {
    const { extraction, state, message, correlationId, phone } = params;

    switch (extraction.intent) {
      case 'help':
        return { reply: CustomerMessages.help, correlationId };

      case 'unknown':
        if (state.pendingIntent === 'payout_request') {
          if (state.collectedAmount === null) {
            return { reply: CustomerMessages.missingAmount, correlationId };
          }
          if (state.collectedCustomerId === null) {
            // Try resolving by WhatsApp before asking for ID.
            const byPhone = await this.payoutService.findCustomer(phone);
            if (!byPhone) {
              return { reply: CustomerMessages.missingCustomerId, correlationId };
            }
          }
        }
        return { reply: CustomerMessages.unknown, correlationId };

      case 'payout_status': {
        const status = await this.payoutService.getStatus({
          whatsappNumber: phone,
          requestCode: extraction.requestCode ?? state.lastRequestCode,
          customerId: extraction.customerId ?? state.collectedCustomerId,
          correlationId,
        });
        return { reply: status.message, correlationId };
      }

      case 'cancel_request': {
        const code = extraction.requestCode ?? state.lastRequestCode;
        if (!code) {
          return {
            reply: 'Please provide the request code you want to cancel (for example, PAY-10001).',
            correlationId,
          };
        }
        const cancelled = await this.payoutService.cancelRequest({
          whatsappNumber: phone,
          requestCode: code,
          correlationId,
        });
        return { reply: cancelled.message, correlationId };
      }

      case 'provide_amount':
      case 'provide_customer_id':
      case 'payout_request': {
        // Prefer WhatsApp-linked customer; only ask for ID if unknown.
        let customerId = state.collectedCustomerId ?? extraction.customerId;
        const amount = state.collectedAmount ?? extraction.amount;

        if (amount === null) {
          return { reply: CustomerMessages.missingAmount, correlationId };
        }

        const known = await this.payoutService.findCustomer(phone, customerId);
        if (!known && !customerId) {
          return { reply: CustomerMessages.missingCustomerId, correlationId };
        }
        if (known) {
          customerId = known.customerId;
          state.collectedCustomerId = known.customerId;
        }

        const created = await this.payoutService.createPayoutRequest({
          whatsappNumber: phone,
          amount,
          customerId,
          conversationId: state.conversationId,
          sourceMessageId: message.messageId,
          correlationId,
        });

        return {
          reply: created.message,
          correlationId,
          createdRequestCode: created.request?.requestCode,
        };
      }

      default:
        return { reply: CustomerMessages.unknown, correlationId };
    }
  }
}
