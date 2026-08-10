import type { Customer } from '../database/types.js';
import type { CustomerRepository } from '../repositories/interfaces.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';
import type { GoogleSheetsClient } from './googleSheetsClient.js';
import { env } from '../config/env.js';

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function rowToCustomer(row: string[]): Customer | null {
  const customerId = row[0]?.trim();
  if (!customerId || customerId.toLowerCase() === 'customer id') {
    return null;
  }

  return {
    customerId: customerId.toUpperCase(),
    customerName: row[1]?.trim() ?? '',
    whatsappNumber: normalizeWhatsAppNumber(row[2] ?? ''),
    active: parseBoolean(row[3]),
    payoutEnabled: parseBoolean(row[4]),
    maximumPayout: parseNumber(row[5]),
    createdAt: row[6]?.trim() ?? '',
  };
}

export class GoogleSheetsCustomerRepository implements CustomerRepository {
  constructor(
    private readonly client: GoogleSheetsClient,
    private readonly range = env.GOOGLE_SHEETS_CUSTOMERS_RANGE,
  ) {}

  private async loadAll(): Promise<Customer[]> {
    const rows = await this.client.getValues(this.range);
    return rows.map(rowToCustomer).filter((c): c is Customer => c !== null);
  }

  async getById(customerId: string): Promise<Customer | null> {
    const customers = await this.loadAll();
    return customers.find((c) => c.customerId === customerId.toUpperCase()) ?? null;
  }

  async getByWhatsAppNumber(phone: string): Promise<Customer | null> {
    const normalized = normalizeWhatsAppNumber(phone);
    const customers = await this.loadAll();
    return customers.find((c) => c.whatsappNumber === normalized) ?? null;
  }

  async listActive(): Promise<Customer[]> {
    const customers = await this.loadAll();
    return customers.filter((c) => c.active);
  }
}

/**
 * In-memory customer repository for tests and local demos.
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  constructor(private customers: Customer[] = []) {}

  async getById(customerId: string): Promise<Customer | null> {
    return this.customers.find((c) => c.customerId === customerId.toUpperCase()) ?? null;
  }

  async getByWhatsAppNumber(phone: string): Promise<Customer | null> {
    const normalized = normalizeWhatsAppNumber(phone);
    return this.customers.find((c) => c.whatsappNumber === normalized) ?? null;
  }

  async listActive(): Promise<Customer[]> {
    return this.customers.filter((c) => c.active);
  }

  seed(customers: Customer[]): void {
    this.customers = customers;
  }
}
