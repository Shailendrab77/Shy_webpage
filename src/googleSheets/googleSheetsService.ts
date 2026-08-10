import { GoogleSheetsClient } from './googleSheetsClient.js';
import { GoogleSheetsCustomerRepository } from './customerRepository.js';
import { GoogleSheetsPayoutRepository } from './payoutRepository.js';

/**
 * Facade matching the documented googleSheetsService surface,
 * backed by repository implementations.
 */
export class GoogleSheetsService {
  readonly client: GoogleSheetsClient;
  readonly customers: GoogleSheetsCustomerRepository;
  readonly payouts: GoogleSheetsPayoutRepository;

  constructor(client = new GoogleSheetsClient()) {
    this.client = client;
    this.customers = new GoogleSheetsCustomerRepository(client);
    this.payouts = new GoogleSheetsPayoutRepository(client);
  }

  getCustomerByWhatsAppNumber(phone: string) {
    return this.customers.getByWhatsAppNumber(phone);
  }

  getCustomerById(customerId: string) {
    return this.customers.getById(customerId);
  }

  createPayoutRequest(
    ...args: Parameters<GoogleSheetsPayoutRepository['create']>
  ) {
    return this.payouts.create(...args);
  }

  findExistingPayoutRequest(
    ...args: Parameters<GoogleSheetsPayoutRepository['findRecentDuplicate']>
  ) {
    return this.payouts.findRecentDuplicate(...args);
  }

  getPayoutRequestByCode(code: string) {
    return this.payouts.getByCode(code);
  }
}
