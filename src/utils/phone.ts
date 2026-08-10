/**
 * Normalize WhatsApp phone numbers to digits-only international form.
 */
export function normalizeWhatsAppNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function maskPhoneNumber(phone: string): string {
  const digits = normalizeWhatsAppNumber(phone);
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskCustomerId(customerId: string): string {
  if (customerId.length <= 3) return '***';
  return `${customerId.slice(0, 2)}***${customerId.slice(-2)}`;
}
