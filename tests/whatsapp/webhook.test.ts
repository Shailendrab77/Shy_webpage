import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { InMemoryCustomerRepository } from '../../src/googleSheets/customerRepository.js';
import { InMemoryPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { FakeWhatsAppService } from '../../src/whatsapp/whatsappService.js';
import { PayoutAgent } from '../../src/agent/agent.js';
import { InMemoryConversationStore } from '../../src/state/conversationStore.js';
import { InMemoryIdempotencyStore } from '../../src/state/idempotencyStore.js';
import { extractIncomingMessages } from '../../src/whatsapp/webhook.js';
import type { Customer } from '../../src/database/types.js';

const customer: Customer = {
  customerId: 'CUST001',
  customerName: 'John Doe',
  whatsappNumber: '919876543210',
  active: true,
  payoutEnabled: true,
  maximumPayout: 50_000,
  createdAt: '2026-08-01 00:00:00',
};

function buildPayload(text: string, messageId = 'wamid.test.1') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'BUSINESS_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '123' },
              contacts: [{ wa_id: '919876543210' }],
              messages: [
                {
                  from: '919876543210',
                  id: messageId,
                  timestamp: '1690000000',
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsApp webhook', () => {
  let whatsapp: FakeWhatsAppService;
  let payouts: InMemoryPayoutRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    whatsapp = new FakeWhatsAppService();
    payouts = new InMemoryPayoutRepository();
    app = createApp({
      customers: new InMemoryCustomerRepository([customer]),
      payouts,
      whatsapp,
      agent: new PayoutAgent(),
      conversationStore: new InMemoryConversationStore(),
      idempotencyStore: new InMemoryIdempotencyStore(),
    });
  });

  it('verifies the webhook challenge', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test-verify-token';
    // env is already loaded; createApp uses env.WHATSAPP_VERIFY_TOKEN from module load.
    // For this test we hit the route with the configured token from env.
    const { env } = await import('../../src/config/env.js');
    const response = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': env.WHATSAPP_VERIFY_TOKEN,
      'hub.challenge': 'challenge-token',
    });

    if (!env.WHATSAPP_VERIFY_TOKEN) {
      expect(response.status).toBe(403);
      return;
    }
    expect(response.status).toBe(200);
    expect(response.text).toBe('challenge-token');
  });

  it('rejects invalid verify tokens', async () => {
    const response = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge-token',
    });
    expect(response.status).toBe(403);
  });

  it('processes an incoming payout message and replies via WhatsApp', async () => {
    const response = await request(app)
      .post('/webhook')
      .send(buildPayload('I want a payout of 5000', 'wamid.webhook.1'));

    expect(response.status).toBe(200);
    expect(whatsapp.sent).toHaveLength(1);
    expect(whatsapp.sent[0]?.message).toContain('PAY-10001');
    expect(payouts.all()).toHaveLength(1);
  });

  it('does not create duplicate payouts when WhatsApp send fails and webhook retries', async () => {
    const failingWhatsApp = new FakeWhatsAppService();
    let attempts = 0;
    vi.spyOn(failingWhatsApp, 'sendTextMessage').mockImplementation(async (phone, message) => {
      attempts += 1;
      if (attempts === 1) {
        const { ExternalServiceError } = await import('../../src/utils/errors.js');
        throw new ExternalServiceError('WhatsApp', 'send failed');
      }
      failingWhatsApp.sent.push({ phoneNumber: phone, message });
      return { messageId: `wamid.fake.${failingWhatsApp.sent.length}` };
    });

    const localApp = createApp({
      customers: new InMemoryCustomerRepository([customer]),
      payouts,
      whatsapp: failingWhatsApp,
      agent: new PayoutAgent(),
      conversationStore: new InMemoryConversationStore(),
      idempotencyStore: new InMemoryIdempotencyStore(),
    });

    await request(localApp).post('/webhook').send(buildPayload('Request 4000', 'wamid.retry.1'));
    await request(localApp).post('/webhook').send(buildPayload('Request 4000', 'wamid.retry.1'));

    expect(payouts.all()).toHaveLength(1);
  });

  it('requires admin API key for admin routes', async () => {
    const response = await request(app).get('/admin/payouts/PAY-10001');
    expect(response.status).toBe(401);
  });
});

describe('extractIncomingMessages', () => {
  it('extracts text messages only', () => {
    const messages = extractIncomingMessages(buildPayload('hello', 'wamid.x'));
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe('hello');
    expect(messages[0]?.from).toBe('919876543210');
  });
});

describe('health endpoint', () => {
  it('returns ok', async () => {
    const app = createApp({
      customers: new InMemoryCustomerRepository([]),
      payouts: new InMemoryPayoutRepository(),
      whatsapp: new FakeWhatsAppService(),
    });
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
