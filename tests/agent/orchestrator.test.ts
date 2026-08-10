import { beforeEach, describe, expect, it } from 'vitest';
import { ConversationOrchestrator } from '../../src/agent/conversationOrchestrator.js';
import { PayoutAgent } from '../../src/agent/agent.js';
import { PayoutService } from '../../src/payout/payoutService.js';
import { InMemoryCustomerRepository } from '../../src/googleSheets/customerRepository.js';
import { InMemoryPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { InMemoryConversationStore } from '../../src/state/conversationStore.js';
import { InMemoryIdempotencyStore } from '../../src/state/idempotencyStore.js';
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

describe('ConversationOrchestrator', () => {
  let orchestrator: ConversationOrchestrator;
  let payouts: InMemoryPayoutRepository;
  let idempotency: InMemoryIdempotencyStore;

  beforeEach(() => {
    process.env.LLM_PROVIDER = 'heuristic';
    payouts = new InMemoryPayoutRepository();
    idempotency = new InMemoryIdempotencyStore();
    const customers = new InMemoryCustomerRepository([customer]);
    orchestrator = new ConversationOrchestrator(
      new PayoutAgent(),
      new PayoutService(customers, payouts),
      new InMemoryConversationStore(),
      idempotency,
    );
  });

  it('completes a multi-turn payout conversation', async () => {
    const first = await orchestrator.processMessage({
      messageId: 'm1',
      from: '919876543210',
      text: 'I need a payout',
      timestamp: '1',
    });
    expect(first.reply.toLowerCase()).toContain('amount');

    const second = await orchestrator.processMessage({
      messageId: 'm2',
      from: '919876543210',
      text: '5000',
      timestamp: '2',
    });
    expect(second.createdRequestCode).toBe('PAY-10001');
    expect(second.reply).toContain('PAY-10001');
  });

  it('ignores duplicate WhatsApp message IDs', async () => {
    const first = await orchestrator.processMessage({
      messageId: 'dup-1',
      from: '919876543210',
      text: 'I want a payout of 3000',
      timestamp: '1',
    });
    const second = await orchestrator.processMessage({
      messageId: 'dup-1',
      from: '919876543210',
      text: 'I want a payout of 3000',
      timestamp: '1',
    });

    expect(first.createdRequestCode).toBe('PAY-10001');
    expect(second.skippedDuplicate).toBe(true);
    expect(payouts.all()).toHaveLength(1);
  });

  it('handles status checks', async () => {
    await orchestrator.processMessage({
      messageId: 'm-create',
      from: '919876543210',
      text: 'Please request 2000',
      timestamp: '1',
    });

    const status = await orchestrator.processMessage({
      messageId: 'm-status',
      from: '919876543210',
      text: 'What is the status of PAY-10001?',
      timestamp: '2',
    });
    expect(status.reply).toContain('Pending');
  });

  it('returns temporary error messaging when Google Sheets fails', async () => {
    const failingPayouts = new InMemoryPayoutRepository();
    failingPayouts.create = async () => {
      const { ExternalServiceError } = await import('../../src/utils/errors.js');
      throw new ExternalServiceError('GoogleSheets', 'down');
    };

    const failingOrchestrator = new ConversationOrchestrator(
      new PayoutAgent(),
      new PayoutService(new InMemoryCustomerRepository([customer]), failingPayouts),
      new InMemoryConversationStore(),
      new InMemoryIdempotencyStore(),
    );

    const result = await failingOrchestrator.processMessage({
      messageId: 'm-fail',
      from: '919876543210',
      text: 'I want a payout of 5000',
      timestamp: '1',
    });

    expect(result.reply).toContain('temporarily unable');
    expect(result.reply.toLowerCase()).not.toContain('google');
    expect(result.reply.toLowerCase()).not.toContain('sheets');
  });
});
