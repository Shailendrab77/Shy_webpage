import { randomUUID } from 'node:crypto';

export function createCorrelationId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function isWithinMinutes(isoTimestamp: string, minutes: number, now = new Date()): boolean {
  const then = new Date(isoTimestamp.includes('T') ? isoTimestamp : isoTimestamp.replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return false;
  return now.getTime() - then.getTime() <= minutes * 60_000;
}
