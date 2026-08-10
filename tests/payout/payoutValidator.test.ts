import { describe, expect, it } from 'vitest';
import {
  canCancelPayout,
  validateAmount,
  validateCustomer,
  validatePayoutRequest,
} from '../../src/payout/payoutValidator.js';
import type { Customer, PayoutRequest } from '../../src/database/types.js';

const activeCustomer: Customer = {
  customerId: 'CUST001',
  customerName: 'John Doe',
  whatsappNumber: '919876543210',
  active: true,
  payoutEnabled: true,
  maximumPayout: 50_000,
  createdAt: '2026-08-01 00:00:00',
};

describe('validateCustomer', () => {
  it('accepts active payout-enabled customers', () => {
    const result = validateCustomer(activeCustomer);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown customers', () => {
    const result = validateCustomer(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CUSTOMER_NOT_FOUND');
  });

  it('rejects inactive customers', () => {
    const result = validateCustomer({ ...activeCustomer, active: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CUSTOMER_INACTIVE');
  });

  it('rejects payout-disabled customers', () => {
    const result = validateCustomer({ ...activeCustomer, payoutEnabled: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('PAYOUT_DISABLED');
  });
});

describe('validateAmount', () => {
  it('requires an amount', () => {
    const result = validateAmount(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('MISSING_AMOUNT');
  });

  it('rejects invalid amounts', () => {
    expect(validateAmount(0).ok).toBe(false);
    expect(validateAmount(-10).ok).toBe(false);
  });

  it('rejects amounts above customer maximum', () => {
    const result = validateAmount(60_000, activeCustomer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('AMOUNT_EXCEEDS_CUSTOMER_MAX');
  });

  it('accepts valid amounts', () => {
    const result = validateAmount(5000, activeCustomer);
    expect(result.ok).toBe(true);
  });
});

describe('validatePayoutRequest', () => {
  it('validates a complete request', () => {
    const result = validatePayoutRequest({
      customer: activeCustomer,
      amount: 5000,
      whatsappNumber: '919876543210',
    });
    expect(result.ok).toBe(true);
  });

  it('blocks WhatsApp mismatch', () => {
    const result = validatePayoutRequest({
      customer: activeCustomer,
      amount: 5000,
      whatsappNumber: '911111111111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('WHATSAPP_MISMATCH');
  });
});

describe('canCancelPayout', () => {
  const pending: PayoutRequest = {
    requestCode: 'PAY-10001',
    customerId: 'CUST001',
    customerName: 'John Doe',
    whatsappNumber: '919876543210',
    amount: 5000,
    status: 'Pending',
    createdAt: '2026-08-10 20:30:00',
    updatedAt: '2026-08-10 20:30:00',
    source: 'WhatsApp',
    conversationId: 'abc',
  };

  it('allows cancelling pending requests when configured', () => {
    expect(canCancelPayout(pending).allowed).toBe(true);
  });

  it('blocks cancelling completed requests', () => {
    expect(canCancelPayout({ ...pending, status: 'Completed' }).allowed).toBe(false);
  });
});
