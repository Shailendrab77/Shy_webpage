import { formatInr } from '../utils/amountParser.js';
import type { PayoutRequest } from '../database/types.js';

export const CustomerMessages = {
  success(request: PayoutRequest): string {
    return [
      '✅ Your payout request has been submitted successfully.',
      '',
      `Request Code: ${request.requestCode}`,
      `Amount: ${formatInr(request.amount)}`,
      `Status: ${request.status}`,
    ].join('\n');
  },

  missingAmount:
    'Sure. What payout amount would you like to request?',

  missingCustomerId:
    'Please provide your customer ID so I can verify your account.',

  invalidCustomer:
    "I couldn't verify that customer ID. Please check it and try again.",

  amountTooHigh:
    'The requested amount exceeds your permitted payout limit. Please enter a lower amount.',

  temporaryError:
    "We're temporarily unable to process your request. Please try again shortly.",

  help: [
    'I can help you with payout requests. You can say things like:',
    '',
    '• "I want a payout of 5000"',
    '• "Check status of PAY-10001"',
    '• "Cancel PAY-10001"',
  ].join('\n'),

  unknown:
    "I'm not sure I understood that. You can request a payout, check a request status, or ask for help.",

  duplicateRequest(request: PayoutRequest): string {
    return [
      'You already have a recent matching payout request.',
      '',
      `Request Code: ${request.requestCode}`,
      `Amount: ${formatInr(request.amount)}`,
      `Status: ${request.status}`,
    ].join('\n');
  },

  status(request: PayoutRequest): string {
    return `Your payout request ${request.requestCode} is currently ${request.status}.`;
  },

  statusNotFound:
    "I couldn't find that payout request. Please check the request code and try again.",

  statusNoRequests:
    "I couldn't find any payout requests for your account.",

  cancelled(requestCode: string): string {
    return `Your payout request ${requestCode} has been cancelled.`;
  },

  cancelNotAllowed(message: string): string {
    return message;
  },

  alreadyProcessed:
    'This message was already processed. If you need another payout, please send a new request.',
} as const;
