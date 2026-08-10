import type { IdempotencyStore } from '../repositories/interfaces.js';
import { env } from '../config/env.js';

interface IdempotencyEntry {
  meta: Record<string, unknown>;
  expiresAt: number;
}

/**
 * In-memory idempotency store keyed by WhatsApp message ID.
 * Designed to be replaced with Redis later.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, IdempotencyEntry>();
  private readonly ttlMs: number;

  constructor(ttlHours = env.IDEMPOTENCY_TTL_HOURS) {
    this.ttlMs = ttlHours * 60 * 60_000;
  }

  async has(key: string): Promise<boolean> {
    this.purgeExpired();
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async mark(key: string, meta: Record<string, unknown> = {}): Promise<void> {
    this.store.set(key, {
      meta,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  async getMeta(key: string): Promise<Record<string, unknown> | null> {
    if (!(await this.has(key))) return null;
    return this.store.get(key)?.meta ?? null;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (now > value.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
