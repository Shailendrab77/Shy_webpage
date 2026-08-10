import { describe, expect, it } from 'vitest';
import { InMemoryPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { RequestCodeGenerator } from '../../src/payout/requestCodeGenerator.js';

describe('RequestCodeGenerator', () => {
  it('starts from configured sequence when empty', async () => {
    const repo = new InMemoryPayoutRepository();
    const generator = new RequestCodeGenerator(repo, 'PAY', 10001);
    await expect(generator.peekNext()).resolves.toBe('PAY-10001');
  });

  it('increments from latest code', async () => {
    const repo = new InMemoryPayoutRepository();
    await repo.create({
      requestCode: 'PAY-10001',
      customerId: 'CUST001',
      customerName: 'John',
      whatsappNumber: '919876543210',
      amount: 100,
      status: 'Pending',
      source: 'WhatsApp',
      conversationId: 'c1',
    });
    const generator = new RequestCodeGenerator(repo, 'PAY', 10001);
    await expect(generator.generateUnique()).resolves.toBe('PAY-10002');
  });

  it('never duplicates an existing code', async () => {
    const repo = new InMemoryPayoutRepository();
    await repo.create({
      requestCode: 'PAY-10001',
      customerId: 'CUST001',
      customerName: 'John',
      whatsappNumber: '919876543210',
      amount: 100,
      status: 'Pending',
      source: 'WhatsApp',
      conversationId: 'c1',
    });
    await repo.create({
      requestCode: 'PAY-10002',
      customerId: 'CUST001',
      customerName: 'John',
      whatsappNumber: '919876543210',
      amount: 200,
      status: 'Pending',
      source: 'WhatsApp',
      conversationId: 'c2',
    });
    const generator = new RequestCodeGenerator(repo, 'PAY', 10001);
    const next = await generator.generateUnique();
    expect(next).toBe('PAY-10003');
    expect(await repo.getByCode(next)).toBeNull();
  });
});
