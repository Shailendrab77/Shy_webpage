/**
 * Domain types for the payout request system.
 * Keep these storage-agnostic so Google Sheets can be swapped for PostgreSQL later.
 */

export type PayoutStatus = 'Pending' | 'Processing' | 'Completed' | 'Cancelled' | 'Failed' | 'Rejected';

export type PayoutSource = 'WhatsApp' | 'Admin' | 'API';

export interface Customer {
  customerId: string;
  customerName: string;
  whatsappNumber: string;
  active: boolean;
  payoutEnabled: boolean;
  maximumPayout: number;
  createdAt: string;
}

export interface PayoutRequest {
  requestCode: string;
  customerId: string;
  customerName: string;
  whatsappNumber: string;
  amount: number;
  status: PayoutStatus;
  createdAt: string;
  updatedAt: string;
  source: PayoutSource;
  conversationId: string;
  /** WhatsApp message ID used for idempotency (optional on older rows). */
  sourceMessageId?: string;
}

export interface CreatePayoutInput {
  customerId: string;
  customerName: string;
  whatsappNumber: string;
  amount: number;
  source: PayoutSource;
  conversationId: string;
  sourceMessageId?: string;
}

export type AgentIntent =
  | 'payout_request'
  | 'payout_status'
  | 'provide_customer_id'
  | 'provide_amount'
  | 'cancel_request'
  | 'help'
  | 'unknown';

export interface AgentExtraction {
  intent: AgentIntent;
  customerId: string | null;
  amount: number | null;
  requestCode: string | null;
  missingFields: Array<'amount' | 'customerId' | 'requestCode'>;
  confidence: number;
  clarificationNeeded: boolean;
  rawNotes?: string;
}

export interface ConversationState {
  conversationId: string;
  whatsappNumber: string;
  collectedCustomerId: string | null;
  collectedAmount: number | null;
  pendingIntent: AgentIntent | null;
  lastRequestCode: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface IncomingWhatsAppMessage {
  messageId: string;
  from: string;
  text: string;
  timestamp: string;
  conversationId?: string;
}

export interface ProcessMessageResult {
  reply: string;
  correlationId: string;
  createdRequestCode?: string;
  skippedDuplicate?: boolean;
}
