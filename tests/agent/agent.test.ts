import { describe, expect, it } from 'vitest';
import { PayoutAgent } from '../../src/agent/agent.js';
import { agentExtractionSchema } from '../../src/agent/schemas.js';

describe('PayoutAgent structured output', () => {
  const agent = new PayoutAgent();

  it('extracts payout request with amount', async () => {
    const result = await agent.extract({
      message: 'I want a payout of 5000',
      whatsappNumber: '919876543210',
      conversation: null,
    });
    expect(result.intent).toBe('payout_request');
    expect(result.amount).toBe(5000);
    expect(() => agentExtractionSchema.parse(result)).not.toThrow();
  });

  it('extracts customer ID when provided alone during collection', async () => {
    const result = await agent.extract({
      message: 'CUST001',
      whatsappNumber: '919876543210',
      conversation: {
        conversationId: 'c1',
        whatsappNumber: '919876543210',
        collectedCustomerId: null,
        collectedAmount: 5000,
        pendingIntent: 'payout_request',
        lastRequestCode: null,
        createdAt: '2026-08-10 20:00:00',
        updatedAt: '2026-08-10 20:00:00',
      },
    });
    expect(result.customerId).toBe('CUST001');
    expect(['provide_customer_id', 'payout_request']).toContain(result.intent);
  });

  it('extracts status intent with request code', async () => {
    const result = await agent.extract({
      message: "What's the status of PAY-10001?",
      whatsappNumber: '919876543210',
      conversation: null,
    });
    expect(result.intent).toBe('payout_status');
    expect(result.requestCode).toBe('PAY-10001');
  });

  it('extracts cancel intent', async () => {
    const result = await agent.extract({
      message: 'Cancel my payout request PAY-10001',
      whatsappNumber: '919876543210',
      conversation: null,
    });
    expect(result.intent).toBe('cancel_request');
    expect(result.requestCode).toBe('PAY-10001');
  });

  it('rejects invalid structured LLM-like payloads via Zod', () => {
    const invalid = {
      intent: 'approve_payout',
      amount: 'lots',
      confidence: 2,
    };
    expect(agentExtractionSchema.safeParse(invalid).success).toBe(false);
  });

  it('does not treat ambiguous 5 as 5000', async () => {
    const result = await agent.extract({
      message: '5',
      whatsappNumber: '919876543210',
      conversation: {
        conversationId: 'c1',
        whatsappNumber: '919876543210',
        collectedCustomerId: 'CUST001',
        collectedAmount: null,
        pendingIntent: 'payout_request',
        lastRequestCode: null,
        createdAt: '2026-08-10 20:00:00',
        updatedAt: '2026-08-10 20:00:00',
      },
    });
    expect(result.amount).toBe(5);
  });
});
