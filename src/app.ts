import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage } from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { webhookRateLimiter } from './middleware/rateLimiter.js';
import { createWhatsAppWebhookRouter } from './whatsapp/webhook.js';
import { WhatsAppService } from './whatsapp/whatsappService.js';
import { createAdminRouter } from './admin/adminRoutes.js';
import { createDemoRouter } from './demo/demoRoutes.js';
import { PayoutAgent } from './agent/agent.js';
import { ConversationOrchestrator } from './agent/conversationOrchestrator.js';
import { PayoutService } from './payout/payoutService.js';
import { InMemoryConversationStore } from './state/conversationStore.js';
import { InMemoryIdempotencyStore } from './state/idempotencyStore.js';
import { GoogleSheetsClient } from './googleSheets/googleSheetsClient.js';
import { GoogleSheetsCustomerRepository, InMemoryCustomerRepository } from './googleSheets/customerRepository.js';
import { GoogleSheetsPayoutRepository, InMemoryPayoutRepository } from './googleSheets/payoutRepository.js';
import type { CustomerRepository, PayoutRepository } from './repositories/interfaces.js';
import { isGoogleSheetsConfigured } from './config/env.js';
import type { Customer } from './database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

export interface AppDependencies {
  customers?: CustomerRepository;
  payouts?: PayoutRepository;
  whatsapp?: WhatsAppService;
  conversationStore?: InMemoryConversationStore;
  idempotencyStore?: InMemoryIdempotencyStore;
  agent?: PayoutAgent;
}

export function createApp(deps: AppDependencies = {}): Express {
  const customers = deps.customers ?? createCustomerRepository();
  const payouts = deps.payouts ?? createPayoutRepository();
  const whatsapp = deps.whatsapp ?? new WhatsAppService();
  const conversationStore = deps.conversationStore ?? new InMemoryConversationStore();
  const idempotencyStore = deps.idempotencyStore ?? new InMemoryIdempotencyStore();
  const agent = deps.agent ?? new PayoutAgent();
  const payoutService = new PayoutService(customers, payouts);
  const orchestrator = new ConversationOrchestrator(
    agent,
    payoutService,
    conversationStore,
    idempotencyStore,
  );

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", 'https://fonts.googleapis.com'],
          "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
          "img-src": ["'self'", 'data:'],
          "connect-src": ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          req.url === '/health' || req.url === '/' || Boolean(req.url?.startsWith('/demo.')),
      },
      serializers: {
        req(req: IncomingMessage & { id?: string }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
      },
    }),
  );

  app.use(express.static(publicDir));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: env.NODE_ENV,
      sheetsConfigured: isGoogleSheetsConfigured(),
      whatsappConfigured: whatsapp.isConfigured(),
      llmProvider: env.LLM_PROVIDER,
    });
  });

  app.use('/demo', webhookRateLimiter, createDemoRouter(orchestrator));
  app.use('/webhook', webhookRateLimiter, createWhatsAppWebhookRouter({ orchestrator, whatsapp }));
  app.use('/admin', createAdminRouter({ customers, payouts }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function createCustomerRepository(): CustomerRepository {
  if (isGoogleSheetsConfigured()) {
    return new GoogleSheetsCustomerRepository(new GoogleSheetsClient());
  }
  logger.warn('Google Sheets not configured; using empty in-memory customer repository');
  return new InMemoryCustomerRepository(demoCustomers());
}

function createPayoutRepository(): PayoutRepository {
  if (isGoogleSheetsConfigured()) {
    return new GoogleSheetsPayoutRepository(new GoogleSheetsClient());
  }
  logger.warn('Google Sheets not configured; using in-memory payout repository');
  return new InMemoryPayoutRepository();
}

function demoCustomers(): Customer[] {
  if (env.NODE_ENV === 'production') {
    return [];
  }
  return [
    {
      customerId: 'CUST001',
      customerName: 'John Doe',
      whatsappNumber: '919876543210',
      active: true,
      payoutEnabled: true,
      maximumPayout: 50_000,
      createdAt: '2026-08-01 00:00:00',
    },
  ];
}
