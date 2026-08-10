import { Router } from 'express';
import { z } from 'zod';
import type { ConversationOrchestrator } from '../agent/conversationOrchestrator.js';
import { randomUUID } from 'node:crypto';

const demoMessageSchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(2000),
});

/**
 * Browser demo endpoint — simulates an incoming WhatsApp text message
 * without calling the WhatsApp Cloud API.
 */
export function createDemoRouter(orchestrator: ConversationOrchestrator): Router {
  const router = Router();

  router.post('/message', async (req, res, next) => {
    try {
      const body = demoMessageSchema.parse(req.body);
      const result = await orchestrator.processMessage({
        messageId: `browser.${randomUUID()}`,
        from: body.phone,
        text: body.message,
        timestamp: String(Date.now()),
      });
      res.json({
        reply: result.reply,
        correlationId: result.correlationId,
        createdRequestCode: result.createdRequestCode ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
