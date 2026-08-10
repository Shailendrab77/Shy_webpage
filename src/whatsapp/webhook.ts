import type { Request, Response, NextFunction, Router } from 'express';
import { Router as createRouter } from 'express';
import { env } from '../config/env.js';
import { whatsappWebhookPayloadSchema } from '../agent/schemas.js';
import type { ConversationOrchestrator } from '../agent/conversationOrchestrator.js';
import type { WhatsAppService } from './whatsappService.js';
import { logger } from '../utils/logger.js';
import type { IncomingWhatsAppMessage } from '../database/types.js';

export function createWhatsAppWebhookRouter(deps: {
  orchestrator: ConversationOrchestrator;
  whatsapp: WhatsAppService;
}): Router {
  const router = createRouter();

  /**
   * Webhook verification (GET)
   * Meta sends hub.mode, hub.verify_token, hub.challenge
   */
  router.get('/', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      logger.info('WhatsApp webhook verified');
      res.status(200).send(String(challenge));
      return;
    }

    logger.warn('WhatsApp webhook verification failed');
    res.sendStatus(403);
  });

  /**
   * Incoming messages (POST)
   * Always acknowledge quickly with 200 to avoid Meta retries where possible.
   * Processing is awaited here for simplicity; for high volume, queue the work.
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = whatsappWebhookPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues }, 'Invalid WhatsApp webhook payload');
        res.sendStatus(200);
        return;
      }

      const messages = extractIncomingMessages(parsed.data);
      if (messages.length === 0) {
        // Status updates / empty payloads — acknowledge.
        res.sendStatus(200);
        return;
      }

      // Acknowledge immediately-ish after extraction; process sequentially.
      // Returning 200 first is safer for Meta; we still process before responding
      // so local/dev testing gets deterministic completion. Idempotency protects retries.
      for (const message of messages) {
        const result = await deps.orchestrator.processMessage(message);
        try {
          await deps.whatsapp.sendTextMessage(message.from, result.reply);
          logger.info(
            { correlationId: result.correlationId, messageId: message.messageId },
            'WhatsApp response sent',
          );
        } catch (sendError) {
          // Log failure; do not create duplicate payouts on retry thanks to idempotency.
          logger.error(
            { err: sendError, correlationId: result.correlationId, messageId: message.messageId },
            'Failed to send WhatsApp response',
          );
        }
      }

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function extractIncomingMessages(
  payload: ReturnType<typeof whatsappWebhookPayloadSchema.parse>,
): IncomingWhatsAppMessage[] {
  const results: IncomingWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value.messages ?? []) {
        if (message.type && message.type !== 'text') {
          continue;
        }
        const text = message.text?.body?.trim();
        if (!text) continue;

        results.push({
          messageId: message.id,
          from: message.from,
          text,
          timestamp: message.timestamp ?? String(Date.now()),
        });
      }
    }
  }

  return results;
}
