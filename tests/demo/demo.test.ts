import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { InMemoryCustomerRepository } from '../../src/googleSheets/customerRepository.js';
import { InMemoryPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { FakeWhatsAppService } from '../../src/whatsapp/whatsappService.js';
import { PayoutAgent } from '../../src/agent/agent.js';
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

describe('Browser demo', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({
      customers: new InMemoryCustomerRepository([customer]),
      payouts: new InMemoryPayoutRepository(),
      whatsapp: new FakeWhatsAppService(),
      agent: new PayoutAgent(),
    });
  });

  it('serves the demo HTML page', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('PayoutDesk');
  });

  it('processes a demo chat message', async () => {
    const response = await request(app)
      .post('/demo/message')
      .send({ phone: '919876543210', message: 'I want a payout of 5000' });

    expect(response.status).toBe(200);
    expect(response.body.reply).toContain('PAY-10001');
    expect(response.body.createdRequestCode).toBe('PAY-10001');
  });
});
