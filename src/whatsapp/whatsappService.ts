import { env, isWhatsAppConfigured } from '../config/env.js';
import { ExternalServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { normalizeWhatsAppNumber } from '../utils/phone.js';

export interface SendMessageResult {
  messageId?: string;
  raw?: unknown;
}

/**
 * WhatsApp Cloud API client.
 * Credentials come only from environment variables.
 */
export class WhatsAppService {
  constructor(
    private readonly accessToken = env.WHATSAPP_ACCESS_TOKEN,
    private readonly phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID,
    private readonly apiVersion = env.WHATSAPP_API_VERSION,
    private readonly baseUrl = env.WHATSAPP_API_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return isWhatsAppConfigured();
  }

  async sendTextMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('WhatsApp', 'WhatsApp Cloud API is not configured');
    }

    const to = normalizeWhatsAppNumber(phoneNumber);
    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }),
      });

      const raw = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        messages?: Array<{ id?: string }>;
      };

      if (!response.ok) {
        logger.error(
          { status: response.status, errorMessage: raw.error?.message },
          'WhatsApp sendTextMessage failed',
        );
        throw new ExternalServiceError(
          'WhatsApp',
          raw.error?.message ?? `HTTP ${response.status}`,
        );
      }

      return {
        messageId: raw.messages?.[0]?.id,
        raw,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      logger.error({ err: error }, 'WhatsApp sendTextMessage network failure');
      throw new ExternalServiceError('WhatsApp', 'Network failure while sending message', error);
    }
  }
}

/** Test double that records outbound messages. */
export class FakeWhatsAppService extends WhatsAppService {
  readonly sent: Array<{ phoneNumber: string; message: string }> = [];

  constructor() {
    super('test-token', 'test-phone-id', 'v21.0', 'https://example.invalid');
  }

  override isConfigured(): boolean {
    return true;
  }

  override async sendTextMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    this.sent.push({ phoneNumber, message });
    return { messageId: `wamid.fake.${this.sent.length}` };
  }
}
