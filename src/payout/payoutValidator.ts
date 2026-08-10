import type { Customer, PayoutRequest } from '../database/types.js';
import { env } from '../config/env.js';
import { formatInr } from '../utils/amountParser.js';

export type ValidationFailureReason =
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_INACTIVE'
  | 'PAYOUT_DISABLED'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'AMOUNT_EXCEEDS_CUSTOMER_MAX'
  | 'AMOUNT_EXCEEDS_GLOBAL_MAX'
  | 'DUPLICATE_REQUEST'
  | 'MISSING_AMOUNT'
  | 'MISSING_CUSTOMER_ID'
  | 'WHATSAPP_MISMATCH';

export interface ValidationSuccess {
  ok: true;
  customer: Customer;
  amount: number;
}

export interface ValidationFailure {
  ok: false;
  reason: ValidationFailureReason;
  message: string;
  duplicate?: PayoutRequest;
}

export type PayoutValidationResult = ValidationSuccess | ValidationFailure;

export function validateAmount(
  amount: number | null | undefined,
  customer?: Customer | null,
): ValidationFailure | { ok: true; amount: number } {
  if (amount === null || amount === undefined) {
    return {
      ok: false,
      reason: 'MISSING_AMOUNT',
      message: 'Sure. What payout amount would you like to request?',
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      reason: 'INVALID_AMOUNT',
      message: 'Please enter a valid payout amount greater than zero.',
    };
  }

  if (amount < env.MIN_PAYOUT_AMOUNT) {
    return {
      ok: false,
      reason: 'AMOUNT_BELOW_MINIMUM',
      message: `The minimum payout amount is ${formatInr(env.MIN_PAYOUT_AMOUNT)}.`,
    };
  }

  if (amount > env.MAX_PAYOUT_AMOUNT) {
    return {
      ok: false,
      reason: 'AMOUNT_EXCEEDS_GLOBAL_MAX',
      message: 'The requested amount exceeds your permitted payout limit. Please enter a lower amount.',
    };
  }

  if (customer && amount > customer.maximumPayout) {
    return {
      ok: false,
      reason: 'AMOUNT_EXCEEDS_CUSTOMER_MAX',
      message: 'The requested amount exceeds your permitted payout limit. Please enter a lower amount.',
    };
  }

  return { ok: true, amount };
}

export function validateCustomer(customer: Customer | null): ValidationFailure | { ok: true; customer: Customer } {
  if (!customer) {
    return {
      ok: false,
      reason: 'CUSTOMER_NOT_FOUND',
      message: "I couldn't verify that customer ID. Please check it and try again.",
    };
  }

  if (!customer.active) {
    return {
      ok: false,
      reason: 'CUSTOMER_INACTIVE',
      message: 'Your account is currently inactive. Please contact support for assistance.',
    };
  }

  if (!customer.payoutEnabled) {
    return {
      ok: false,
      reason: 'PAYOUT_DISABLED',
      message: 'Payouts are not enabled for your account. Please contact support for assistance.',
    };
  }

  return { ok: true, customer };
}

export function validatePayoutRequest(params: {
  customer: Customer | null;
  amount: number | null | undefined;
  whatsappNumber: string;
  requireCustomerIdMatch?: boolean;
  providedCustomerId?: string | null;
}): PayoutValidationResult {
  if (!params.customer && !params.providedCustomerId) {
    return {
      ok: false,
      reason: 'MISSING_CUSTOMER_ID',
      message: 'Please provide your customer ID so I can verify your account.',
    };
  }

  const customerResult = validateCustomer(params.customer);
  if (!customerResult.ok) {
    return customerResult;
  }

  const customer = customerResult.customer;

  // Never trust a customer ID that does not match the WhatsApp number on file
  // when the customer was looked up by ID — enforce WhatsApp ownership.
  if (
    params.requireCustomerIdMatch !== false &&
    customer.whatsappNumber &&
    customer.whatsappNumber !== params.whatsappNumber.replace(/\D/g, '')
  ) {
    return {
      ok: false,
      reason: 'WHATSAPP_MISMATCH',
      message: "I couldn't verify that customer ID for this WhatsApp number. Please check it and try again.",
    };
  }

  const amountResult = validateAmount(params.amount, customer);
  if (!amountResult.ok) {
    return amountResult;
  }

  return {
    ok: true,
    customer,
    amount: amountResult.amount,
  };
}

export function canCancelPayout(request: PayoutRequest): { allowed: boolean; message: string } {
  if (!env.ALLOW_PAYOUT_CANCELLATION) {
    return {
      allowed: false,
      message:
        'Payout requests cannot be cancelled through WhatsApp. Please contact support if you need help.',
    };
  }

  if (request.status !== 'Pending') {
    return {
      allowed: false,
      message: `Request ${request.requestCode} is ${request.status} and can no longer be cancelled. Please contact support if you need help.`,
    };
  }

  return {
    allowed: true,
    message: `Your payout request ${request.requestCode} has been cancelled.`,
  };
}
