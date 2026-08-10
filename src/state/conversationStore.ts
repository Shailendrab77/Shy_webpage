import type { ConversationState } from '../database/types.js';
import type { ConversationStore } from '../repositories/interfaces.js';
import { env } from '../config/env.js';

interface StoredConversation {
  state: ConversationState;
  expiresAt: number;
}

/**
 * In-memory conversation store.
 * Swap this implementation for Redis without changing callers.
 */
export class InMemoryConversationStore implements ConversationStore {
  private readonly store = new Map<string, StoredConversation>();
  private readonly ttlMs: number;

  constructor(ttlMinutes = env.CONVERSATION_TTL_MINUTES) {
    this.ttlMs = ttlMinutes * 60_000;
  }

  async get(whatsappNumber: string): Promise<ConversationState | null> {
    this.purgeExpired();
    const entry = this.store.get(whatsappNumber);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(whatsappNumber);
      return null;
    }
    return structuredClone(entry.state);
  }

  async save(state: ConversationState): Promise<void> {
    this.store.set(state.whatsappNumber, {
      state: structuredClone(state),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  async clear(whatsappNumber: string): Promise<void> {
    this.store.delete(whatsappNumber);
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
