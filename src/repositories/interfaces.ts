import type { Customer, CreatePayoutInput, PayoutRequest, PayoutStatus } from '../database/types.js';

/**
 * Storage-agnostic customer repository.
 * Google Sheets today; PostgreSQL / MySQL later without changing agent logic.
 */
export interface CustomerRepository {
  getById(customerId: string): Promise<Customer | null>;
  getByWhatsAppNumber(phone: string): Promise<Customer | null>;
  listActive(): Promise<Customer[]>;
}

/**
 * Storage-agnostic payout repository.
 */
export interface PayoutRepository {
  create(request: CreatePayoutInput & { requestCode: string; status: PayoutStatus }): Promise<PayoutRequest>;
  getByCode(code: string): Promise<PayoutRequest | null>;
  findByCustomerId(customerId: string): Promise<PayoutRequest[]>;
  findRecentDuplicate(params: {
    customerId: string;
    amount: number;
    withinMinutes: number;
  }): Promise<PayoutRequest | null>;
  findBySourceMessageId(messageId: string): Promise<PayoutRequest | null>;
  updateStatus(code: string, status: PayoutStatus): Promise<PayoutRequest | null>;
  /** Used by sequential request-code generation. */
  getLatestRequestCode(): Promise<string | null>;
}

export interface ConversationStore {
  get(whatsappNumber: string): Promise<import('../database/types.js').ConversationState | null>;
  save(state: import('../database/types.js').ConversationState): Promise<void>;
  clear(whatsappNumber: string): Promise<void>;
}

export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  mark(key: string, meta?: Record<string, unknown>): Promise<void>;
  getMeta(key: string): Promise<Record<string, unknown> | null>;
}
