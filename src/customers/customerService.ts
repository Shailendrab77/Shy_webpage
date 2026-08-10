import type { CustomerRepository } from '../repositories/interfaces.js';
import type { Customer } from '../database/types.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';

export class CustomerService {
  constructor(private readonly customers: CustomerRepository) {}

  async getById(customerId: string): Promise<Customer | null> {
    return this.customers.getById(customerId.trim().toUpperCase());
  }

  async getByWhatsAppNumber(phone: string): Promise<Customer | null> {
    return this.customers.getByWhatsAppNumber(normalizeWhatsAppNumber(phone));
  }

  /**
   * Resolve customer from WhatsApp number first, then optional provided customer ID.
   * Provided IDs are always validated against the Customers sheet — never trusted alone.
   */
  async resolveCustomer(params: {
    whatsappNumber: string;
    customerId?: string | null;
  }): Promise<{ customer: Customer | null; lookedUpBy: 'whatsapp' | 'customerId' | 'none' }> {
    const byPhone = await this.getByWhatsAppNumber(params.whatsappNumber);
    if (byPhone) {
      if (params.customerId && byPhone.customerId !== params.customerId.trim().toUpperCase()) {
        // WhatsApp is bound to a different customer ID than the one provided.
        return { customer: null, lookedUpBy: 'whatsapp' };
      }
      return { customer: byPhone, lookedUpBy: 'whatsapp' };
    }

    if (params.customerId) {
      const byId = await this.getById(params.customerId);
      return { customer: byId, lookedUpBy: 'customerId' };
    }

    return { customer: null, lookedUpBy: 'none' };
  }
}
