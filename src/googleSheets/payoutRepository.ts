import type { CreatePayoutInput, PayoutRequest, PayoutStatus, PayoutSource } from '../database/types.js';
import type { PayoutRepository } from '../repositories/interfaces.js';
import { isWithinMinutes, nowIso } from '../utils/time.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';
import type { GoogleSheetsClient } from './googleSheetsClient.js';
import { env } from '../config/env.js';
import { ConflictError } from '../utils/errors.js';

const HEADER = [
  'Request Code',
  'Customer ID',
  'Customer Name',
  'WhatsApp Number',
  'Amount',
  'Status',
  'Created At',
  'Updated At',
  'Source',
  'Conversation ID',
];

function rowToPayout(row: string[], rowIndex: number): (PayoutRequest & { rowIndex: number }) | null {
  const requestCode = row[0]?.trim();
  if (!requestCode || requestCode.toLowerCase() === 'request code') {
    return null;
  }

  return {
    requestCode: requestCode.toUpperCase(),
    customerId: (row[1] ?? '').trim().toUpperCase(),
    customerName: (row[2] ?? '').trim(),
    whatsappNumber: normalizeWhatsAppNumber(row[3] ?? ''),
    amount: Number(String(row[4] ?? '0').replace(/,/g, '')) || 0,
    status: (row[5]?.trim() as PayoutStatus) || 'Pending',
    createdAt: row[6]?.trim() ?? '',
    updatedAt: row[7]?.trim() ?? '',
    source: (row[8]?.trim() as PayoutSource) || 'WhatsApp',
    conversationId: row[9]?.trim() ?? '',
    sourceMessageId: row[10]?.trim() || undefined,
    rowIndex,
  };
}

function payoutToRow(payout: PayoutRequest): unknown[] {
  return [
    payout.requestCode,
    payout.customerId,
    payout.customerName,
    payout.whatsappNumber,
    payout.amount,
    payout.status,
    payout.createdAt,
    payout.updatedAt,
    payout.source,
    payout.conversationId,
    payout.sourceMessageId ?? '',
  ];
}

export class GoogleSheetsPayoutRepository implements PayoutRepository {
  constructor(
    private readonly client: GoogleSheetsClient,
    private readonly range = env.GOOGLE_SHEETS_PAYOUTS_RANGE,
  ) {}

  private sheetName(): string {
    return this.range.split('!')[0] ?? 'PayoutRequests';
  }

  private async loadAll(): Promise<Array<PayoutRequest & { rowIndex: number }>> {
    const rows = await this.client.getValues(this.range);
    return rows
      .map((row, index) => rowToPayout(row, index + 1))
      .filter((r): r is PayoutRequest & { rowIndex: number } => r !== null);
  }

  async create(
    input: CreatePayoutInput & { requestCode: string; status: PayoutStatus },
  ): Promise<PayoutRequest> {
    // Soft uniqueness check before append (Sheets is not transactional).
    const existing = await this.getByCode(input.requestCode);
    if (existing) {
      throw new ConflictError(`Request code ${input.requestCode} already exists`);
    }

    if (input.sourceMessageId) {
      const byMessage = await this.findBySourceMessageId(input.sourceMessageId);
      if (byMessage) {
        return byMessage;
      }
    }

    const timestamp = nowIso();
    const payout: PayoutRequest = {
      requestCode: input.requestCode,
      customerId: input.customerId,
      customerName: input.customerName,
      whatsappNumber: normalizeWhatsAppNumber(input.whatsappNumber),
      amount: input.amount,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: input.source,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
    };

    // Ensure header exists on first write if sheet is empty.
    const raw = await this.client.getValues(this.range);
    if (raw.length === 0) {
      await this.client.appendValues(this.range, [HEADER]);
    }

    await this.client.appendValues(this.range, [payoutToRow(payout)]);
    return payout;
  }

  async getByCode(code: string): Promise<PayoutRequest | null> {
    const all = await this.loadAll();
    return all.find((p) => p.requestCode === code.toUpperCase()) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<PayoutRequest[]> {
    const all = await this.loadAll();
    return all.filter((p) => p.customerId === customerId.toUpperCase());
  }

  async findRecentDuplicate(params: {
    customerId: string;
    amount: number;
    withinMinutes: number;
  }): Promise<PayoutRequest | null> {
    const all = await this.loadAll();
    const matches = all
      .filter(
        (p) =>
          p.customerId === params.customerId.toUpperCase() &&
          p.amount === params.amount &&
          p.status === 'Pending' &&
          isWithinMinutes(p.createdAt, params.withinMinutes),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0] ?? null;
  }

  async findBySourceMessageId(messageId: string): Promise<PayoutRequest | null> {
    const all = await this.loadAll();
    return all.find((p) => p.sourceMessageId === messageId) ?? null;
  }

  async updateStatus(code: string, status: PayoutStatus): Promise<PayoutRequest | null> {
    const all = await this.loadAll();
    const existing = all.find((p) => p.requestCode === code.toUpperCase());
    if (!existing) return null;

    const updated: PayoutRequest = {
      ...existing,
      status,
      updatedAt: nowIso(),
    };

    const range = `${this.sheetName()}!A${existing.rowIndex}:K${existing.rowIndex}`;
    await this.client.updateValues(range, [payoutToRow(updated)]);
    return updated;
  }

  async getLatestRequestCode(): Promise<string | null> {
    const all = await this.loadAll();
    if (all.length === 0) return null;

    const sorted = [...all].sort((a, b) => {
      const aNum = Number(a.requestCode.split('-')[1] ?? 0);
      const bNum = Number(b.requestCode.split('-')[1] ?? 0);
      return bNum - aNum;
    });
    return sorted[0]?.requestCode ?? null;
  }
}

/**
 * In-memory payout repository for tests.
 */
export class InMemoryPayoutRepository implements PayoutRepository {
  private payouts: PayoutRequest[] = [];

  async create(
    input: CreatePayoutInput & { requestCode: string; status: PayoutStatus },
  ): Promise<PayoutRequest> {
    if (this.payouts.some((p) => p.requestCode === input.requestCode)) {
      throw new ConflictError(`Request code ${input.requestCode} already exists`);
    }
    if (input.sourceMessageId) {
      const existing = await this.findBySourceMessageId(input.sourceMessageId);
      if (existing) return existing;
    }

    const timestamp = nowIso();
    const payout: PayoutRequest = {
      requestCode: input.requestCode,
      customerId: input.customerId,
      customerName: input.customerName,
      whatsappNumber: normalizeWhatsAppNumber(input.whatsappNumber),
      amount: input.amount,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: input.source,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
    };
    this.payouts.push(payout);
    return payout;
  }

  async getByCode(code: string): Promise<PayoutRequest | null> {
    return this.payouts.find((p) => p.requestCode === code.toUpperCase()) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<PayoutRequest[]> {
    return this.payouts.filter((p) => p.customerId === customerId.toUpperCase());
  }

  async findRecentDuplicate(params: {
    customerId: string;
    amount: number;
    withinMinutes: number;
  }): Promise<PayoutRequest | null> {
    return (
      this.payouts.find(
        (p) =>
          p.customerId === params.customerId.toUpperCase() &&
          p.amount === params.amount &&
          p.status === 'Pending' &&
          isWithinMinutes(p.createdAt, params.withinMinutes),
      ) ?? null
    );
  }

  async findBySourceMessageId(messageId: string): Promise<PayoutRequest | null> {
    return this.payouts.find((p) => p.sourceMessageId === messageId) ?? null;
  }

  async updateStatus(code: string, status: PayoutStatus): Promise<PayoutRequest | null> {
    const existing = await this.getByCode(code);
    if (!existing) return null;
    existing.status = status;
    existing.updatedAt = nowIso();
    return existing;
  }

  async getLatestRequestCode(): Promise<string | null> {
    if (this.payouts.length === 0) return null;
    const sorted = [...this.payouts].sort((a, b) => {
      const aNum = Number(a.requestCode.split('-')[1] ?? 0);
      const bNum = Number(b.requestCode.split('-')[1] ?? 0);
      return bNum - aNum;
    });
    return sorted[0]?.requestCode ?? null;
  }

  seed(payouts: PayoutRequest[]): void {
    this.payouts = payouts;
  }

  all(): PayoutRequest[] {
    return [...this.payouts];
  }
}
