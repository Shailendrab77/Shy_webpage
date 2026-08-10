import type { CustomerRepository, PayoutRepository } from '../repositories/interfaces.js';
import type { CreatePayoutInput, Customer, PayoutRequest } from '../database/types.js';
import { env } from '../config/env.js';
import { RequestCodeGenerator } from './requestCodeGenerator.js';
import { canCancelPayout, validatePayoutRequest } from './payoutValidator.js';
import { CustomerMessages } from './messages.js';
import { childLogger } from '../utils/logger.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';
import { CustomerService } from '../customers/customerService.js';

export interface CreatePayoutResult {
  success: boolean;
  request?: PayoutRequest;
  message: string;
  validationReason?: string;
}

export class PayoutService {
  private readonly codes: RequestCodeGenerator;
  private readonly customerService: CustomerService;

  constructor(
    customers: CustomerRepository,
    private readonly payouts: PayoutRepository,
  ) {
    this.codes = new RequestCodeGenerator(payouts);
    this.customerService = new CustomerService(customers);
  }

  async createPayoutRequest(params: {
    whatsappNumber: string;
    amount: number | null;
    customerId?: string | null;
    conversationId: string;
    sourceMessageId?: string;
    correlationId: string;
  }): Promise<CreatePayoutResult> {
    const log = childLogger({ correlationId: params.correlationId });

    // Idempotency: same WhatsApp message must not create two requests.
    if (params.sourceMessageId) {
      const existingByMessage = await this.payouts.findBySourceMessageId(params.sourceMessageId);
      if (existingByMessage) {
        log.info(
          { requestCode: existingByMessage.requestCode },
          'Idempotent hit: payout already created for message',
        );
        return {
          success: true,
          request: existingByMessage,
          message: CustomerMessages.success(existingByMessage),
        };
      }
    }

    const resolved = await this.customerService.resolveCustomer({
      whatsappNumber: params.whatsappNumber,
      customerId: params.customerId,
    });

    const validation = validatePayoutRequest({
      customer: resolved.customer,
      amount: params.amount,
      whatsappNumber: normalizeWhatsAppNumber(params.whatsappNumber),
      providedCustomerId: params.customerId,
      requireCustomerIdMatch: true,
    });

    log.info(
      {
        intent: 'payout_request',
        validationOk: validation.ok,
        reason: validation.ok ? undefined : validation.reason,
        lookedUpBy: resolved.lookedUpBy,
      },
      'Payout validation result',
    );

    if (!validation.ok) {
      return {
        success: false,
        message: validation.message,
        validationReason: validation.reason,
      };
    }

    const duplicate = await this.payouts.findRecentDuplicate({
      customerId: validation.customer.customerId,
      amount: validation.amount,
      withinMinutes: env.DUPLICATE_REQUEST_WINDOW_MINUTES,
    });

    if (duplicate) {
      log.info({ requestCode: duplicate.requestCode }, 'Duplicate payout request blocked');
      return {
        success: false,
        request: duplicate,
        message: CustomerMessages.duplicateRequest(duplicate),
        validationReason: 'DUPLICATE_REQUEST',
      };
    }

    const requestCode = await this.codes.generateUnique();
    const input: CreatePayoutInput & { requestCode: string; status: 'Pending' } = {
      requestCode,
      customerId: validation.customer.customerId,
      customerName: validation.customer.customerName,
      whatsappNumber: validation.customer.whatsappNumber,
      amount: validation.amount,
      source: 'WhatsApp',
      conversationId: params.conversationId,
      sourceMessageId: params.sourceMessageId,
      status: 'Pending',
    };

    // Status is always Pending unless backend explicitly changes it later.
    const created = await this.payouts.create(input);

    log.info(
      { requestCode: created.requestCode, amount: created.amount },
      'Payout request created',
    );

    return {
      success: true,
      request: created,
      message: CustomerMessages.success(created),
    };
  }

  async getStatus(params: {
    whatsappNumber: string;
    requestCode?: string | null;
    customerId?: string | null;
    correlationId: string;
  }): Promise<{ message: string; request?: PayoutRequest }> {
    const log = childLogger({ correlationId: params.correlationId });
    const phone = normalizeWhatsAppNumber(params.whatsappNumber);

    if (params.requestCode) {
      const request = await this.payouts.getByCode(params.requestCode);
      if (!request) {
        return { message: CustomerMessages.statusNotFound };
      }
      // Only return payout info belonging to this WhatsApp number.
      if (request.whatsappNumber !== phone) {
        log.warn({ requestCode: params.requestCode }, 'Status access denied: WhatsApp mismatch');
        return { message: CustomerMessages.statusNotFound };
      }
      return { message: CustomerMessages.status(request), request };
    }

    const resolved = await this.customerService.resolveCustomer({
      whatsappNumber: phone,
      customerId: params.customerId,
    });

    if (!resolved.customer) {
      return { message: CustomerMessages.statusNoRequests };
    }

    const requests = await this.payouts.findByCustomerId(resolved.customer.customerId);
    const owned = requests
      .filter((r) => r.whatsappNumber === phone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (owned.length === 0) {
      return { message: CustomerMessages.statusNoRequests };
    }

    const latest = owned[0]!;
    return { message: CustomerMessages.status(latest), request: latest };
  }

  async cancelRequest(params: {
    whatsappNumber: string;
    requestCode: string;
    correlationId: string;
  }): Promise<{ message: string; request?: PayoutRequest }> {
    const log = childLogger({ correlationId: params.correlationId });
    const phone = normalizeWhatsAppNumber(params.whatsappNumber);
    const request = await this.payouts.getByCode(params.requestCode);

    if (!request || request.whatsappNumber !== phone) {
      return { message: CustomerMessages.statusNotFound };
    }

    const decision = canCancelPayout(request);
    if (!decision.allowed) {
      return { message: CustomerMessages.cancelNotAllowed(decision.message), request };
    }

    const updated = await this.payouts.updateStatus(request.requestCode, 'Cancelled');
    log.info({ requestCode: request.requestCode }, 'Payout request cancelled');
    return {
      message: CustomerMessages.cancelled(request.requestCode),
      request: updated ?? request,
    };
  }

  async findCustomer(whatsappNumber: string, customerId?: string | null): Promise<Customer | null> {
    const resolved = await this.customerService.resolveCustomer({ whatsappNumber, customerId });
    return resolved.customer;
  }
}
