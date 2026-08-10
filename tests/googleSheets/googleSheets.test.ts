import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsClient } from '../../src/googleSheets/googleSheetsClient.js';
import { GoogleSheetsCustomerRepository } from '../../src/googleSheets/customerRepository.js';
import { GoogleSheetsPayoutRepository } from '../../src/googleSheets/payoutRepository.js';
import { ExternalServiceError } from '../../src/utils/errors.js';

describe('GoogleSheets repositories (mocked client)', () => {
  it('maps customer rows', async () => {
    const client = {
      getValues: vi.fn(async () => [
        ['Customer ID', 'Customer Name', 'WhatsApp Number', 'Active', 'Payout Enabled', 'Maximum Payout', 'Created At'],
        ['CUST001', 'John Doe', '919876543210', 'TRUE', 'TRUE', '50000', '2026-08-01'],
      ]),
      appendValues: vi.fn(),
      updateValues: vi.fn(),
      isConfigured: () => true,
      spreadsheetId: 'sheet',
      getClient: vi.fn(),
    } as unknown as GoogleSheetsClient;

    const repo = new GoogleSheetsCustomerRepository(client);
    const customer = await repo.getById('CUST001');
    expect(customer?.customerName).toBe('John Doe');
    expect(customer?.maximumPayout).toBe(50_000);
    expect(await repo.getByWhatsAppNumber('919876543210')).not.toBeNull();
  });

  it('creates payout rows and finds by code', async () => {
    const rows: string[][] = [
      ['Request Code', 'Customer ID', 'Customer Name', 'WhatsApp Number', 'Amount', 'Status', 'Created At', 'Updated At', 'Source', 'Conversation ID'],
    ];
    const client = {
      getValues: vi.fn(async () => rows),
      appendValues: vi.fn(async (_range: string, values: unknown[][]) => {
        rows.push(values[0]!.map(String));
      }),
      updateValues: vi.fn(),
      isConfigured: () => true,
      spreadsheetId: 'sheet',
      getClient: vi.fn(),
    } as unknown as GoogleSheetsClient;

    const repo = new GoogleSheetsPayoutRepository(client);
    const created = await repo.create({
      requestCode: 'PAY-10001',
      customerId: 'CUST001',
      customerName: 'John Doe',
      whatsappNumber: '919876543210',
      amount: 5000,
      status: 'Pending',
      source: 'WhatsApp',
      conversationId: 'abc123',
      sourceMessageId: 'wamid.1',
    });

    expect(created.requestCode).toBe('PAY-10001');
    expect(await repo.getByCode('PAY-10001')).not.toBeNull();
    expect(await repo.findBySourceMessageId('wamid.1')).not.toBeNull();
  });

  it('wraps client failures as ExternalServiceError', async () => {
    const client = new GoogleSheetsClient({
      ...((await import('../../src/config/env.js')).env),
      GOOGLE_SHEETS_SPREADSHEET_ID: '',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
      GOOGLE_PRIVATE_KEY: '',
    });

    await expect(client.getValues('Customers!A:G')).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
