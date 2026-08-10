import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCustomerRepository } from '../../src/googleSheets/customerRepository.js';
import { InMemoryPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { PayoutService } from '../../src/payout/payoutService.js';
import type { Customer } from '../../src/database/types.js';
import { ExternalServiceError } from '../../src/utils/errors.js';

const customer: Customer = {
  customerId: 'CUST001',
  customerName: 'John Doe',
  whatsappNumber: '919876543210',
  active: true,
  payoutEnabled: true,
  maximumPayout: 50_000,
  createdAt: '2026-08-01 00:00:00',
};

describe('PayoutService', () => {
  let customers: InMemoryCustomerRepository;
  let payouts: InMemoryPayoutRepository;
  let service: PayoutService;

  beforeEach(() => {
    customers = new InMemoryCustomerRepository([customer]);
    payouts = new InMemoryPayoutRepository();
    service = new PayoutService(customers, payouts);
  });

  it('creates a valid payout request with Pending status', async () => {
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      customerId: 'CUST001',
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.1',
      correlationId: 'corr-1',
    });

    expect(result.success).toBe(true);
    expect(result.request?.requestCode).toBe('PAY-10001');
    expect(result.request?.status).toBe('Pending');
    expect(result.message).toContain('PAY-10001');
    expect(result.message).toContain('Pending');
  });

  it('asks for missing amount', async () => {
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: null,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('MISSING_AMOUNT');
  });

  it('asks for missing customer ID when WhatsApp is unknown', async () => {
    customers.seed([]);
    const result = await service.createPayoutRequest({
      whatsappNumber: '919999999999',
      amount: 5000,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('MISSING_CUSTOMER_ID');
  });

  it('rejects unknown customer IDs', async () => {
    customers.seed([]);
    const result = await service.createPayoutRequest({
      whatsappNumber: '919999999999',
      amount: 5000,
      customerId: 'CUST999',
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('CUSTOMER_NOT_FOUND');
  });

  it('rejects inactive customers', async () => {
    customers.seed([{ ...customer, active: false }]);
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('CUSTOMER_INACTIVE');
  });

  it('rejects payout-disabled customers', async () => {
    customers.seed([{ ...customer, payoutEnabled: false }]);
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('PAYOUT_DISABLED');
  });

  it('rejects amounts above maximum', async () => {
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 60_000,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('AMOUNT_EXCEEDS_CUSTOMER_MAX');
  });

  it('rejects invalid amounts', async () => {
    const result = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: -1,
      conversationId: 'conv-1',
      correlationId: 'corr-1',
    });
    expect(result.success).toBe(false);
    expect(result.validationReason).toBe('INVALID_AMOUNT');
  });

  it('is idempotent for the same WhatsApp message ID', async () => {
    const first = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.dup',
      correlationId: 'corr-1',
    });
    const second = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.dup',
      correlationId: 'corr-2',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.request?.requestCode).toBe(first.request?.requestCode);
    expect(payouts.all()).toHaveLength(1);
  });

  it('blocks duplicate recent payout requests', async () => {
    await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.a',
      correlationId: 'corr-1',
    });
    const duplicate = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 5000,
      conversationId: 'conv-2',
      sourceMessageId: 'wamid.b',
      correlationId: 'corr-2',
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.validationReason).toBe('DUPLICATE_REQUEST');
    expect(payouts.all()).toHaveLength(1);
  });

  it('returns payout status for the owning customer', async () => {
    const created = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 2500,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.status',
      correlationId: 'corr-1',
    });

    const status = await service.getStatus({
      whatsappNumber: '919876543210',
      requestCode: created.request!.requestCode,
      correlationId: 'corr-2',
    });
    expect(status.message).toContain('Pending');
  });

  it('does not expose another customer payout status', async () => {
    const created = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 2500,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.other',
      correlationId: 'corr-1',
    });

    const status = await service.getStatus({
      whatsappNumber: '911111111111',
      requestCode: created.request!.requestCode,
      correlationId: 'corr-2',
    });
    expect(status.message).toContain("couldn't find");
  });

  it('handles invalid request codes', async () => {
    const status = await service.getStatus({
      whatsappNumber: '919876543210',
      requestCode: 'PAY-99999',
      correlationId: 'corr-1',
    });
    expect(status.message).toContain("couldn't find");
  });

  it('cancels a pending request when allowed', async () => {
    const created = await service.createPayoutRequest({
      whatsappNumber: '919876543210',
      amount: 1500,
      conversationId: 'conv-1',
      sourceMessageId: 'wamid.cancel',
      correlationId: 'corr-1',
    });
    const cancelled = await service.cancelRequest({
      whatsappNumber: '919876543210',
      requestCode: created.request!.requestCode,
      correlationId: 'corr-2',
    });
    expect(cancelled.message).toContain('cancelled');
    expect((await payouts.getByCode(created.request!.requestCode))?.status).toBe('Cancelled');
  });
});

describe('PayoutService storage failures', () => {
  it('surfaces customer-safe errors when repository fails', async () => {
    const failingPayouts = {
      async create(): Promise<never> {
        throw new ExternalServiceError('GoogleSheets', 'unavailable');
      },
      async getByCode() {
        return null;
      },
      async findByCustomerId() {
        return [];
      },
      async findRecentDuplicate() {
        return null;
      },
      async findBySourceMessageId() {
        return null;
      },
      async updateStatus() {
        return null;
      },
      async getLatestRequestCode() {
        return null;
      },
    };

    const service = new PayoutService(new InMemoryCustomerRepository([customer]), failingPayouts);
    await expect(
      service.createPayoutRequest({
        whatsappNumber: '919876543210',
        amount: 5000,
        conversationId: 'conv-1',
        sourceMessageId: 'wamid.fail',
        correlationId: 'corr-1',
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
