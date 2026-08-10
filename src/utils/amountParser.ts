/**
 * Parse Indian currency formats into a numeric amount.
 * Ambiguous tiny values like "5" are accepted as literal 5 (not 5000).
 * Returns null when the amount cannot be confidently parsed.
 */
export function parseAmount(input: string): number | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const text = input.trim();
  if (!text) return null;

  // Prefer explicit currency-marked amounts first.
  // Indian-grouped form requires at least one comma so "₹2500" is not truncated to 250.
  const amountToken =
    '([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)';
  const currencyPatterns = [
    new RegExp(`(?:₹|rs\\.?|inr)\\s*${amountToken}`, 'i'),
    new RegExp(`${amountToken}\\s*(?:₹|rs\\.?|inr)`, 'i'),
  ];

  for (const pattern of currencyPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeNumericToken(match[1]);
    }
  }

  // Bare numbers / Indian-grouped numbers (e.g. 5,000 or 5000)
  const bareMatch = text.match(
    /\b([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\b/,
  );
  if (!bareMatch?.[1]) {
    return null;
  }

  return normalizeNumericToken(bareMatch[1]);
}

function normalizeNumericToken(token: string): number | null {
  const cleaned = token.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  // Reject absurd fractional precision for payout amounts.
  if (!Number.isInteger(value) && !/^\d+\.\d{1,2}$/.test(cleaned)) {
    return null;
  }
  return value;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * Extract a request code like PAY-10001 from free text.
 */
export function parseRequestCode(input: string, prefix = 'PAY'): string | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}-(\\d+)\\b`, 'i');
  const match = input.match(pattern);
  if (!match) return null;
  return `${prefix.toUpperCase()}-${match[1]}`;
}

/**
 * Extract a customer ID like CUST001 from free text.
 */
export function parseCustomerId(input: string): string | null {
  const match = input.match(/\b(CUST[A-Z0-9]+)\b/i);
  return match ? match[1].toUpperCase() : null;
}
