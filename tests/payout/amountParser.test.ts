import { describe, expect, it } from 'vitest';
import { formatInr, parseAmount, parseCustomerId, parseRequestCode } from '../../src/utils/amountParser.js';

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('5000')).toBe(5000);
    expect(parseAmount('I want a payout of 5000')).toBe(5000);
  });

  it('parses Indian grouped numbers', () => {
    expect(parseAmount('5,000')).toBe(5000);
    expect(parseAmount('Please request 10,000')).toBe(10_000);
  });

  it('parses currency symbols and prefixes', () => {
    expect(parseAmount('₹2500')).toBe(2500);
    expect(parseAmount('₹5,000')).toBe(5000);
    expect(parseAmount('Rs 5000')).toBe(5000);
    expect(parseAmount('INR 5000')).toBe(5000);
    expect(parseAmount('I want to withdraw ₹2500')).toBe(2500);
  });

  it('does not inflate ambiguous small amounts', () => {
    expect(parseAmount('5')).toBe(5);
    expect(parseAmount('I need 5')).toBe(5);
  });

  it('returns null for non-amounts', () => {
    expect(parseAmount('hello')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('formatInr', () => {
  it('formats with Indian grouping', () => {
    expect(formatInr(5000)).toContain('5,000');
  });
});

describe('parseRequestCode / parseCustomerId', () => {
  it('extracts request codes', () => {
    expect(parseRequestCode('Check PAY-10001')).toBe('PAY-10001');
    expect(parseRequestCode('status of pay-10002')).toBe('PAY-10002');
  });

  it('extracts customer IDs', () => {
    expect(parseCustomerId('My id is CUST001')).toBe('CUST001');
    expect(parseCustomerId('cust123')).toBe('CUST123');
  });
});
