import type { PayoutRepository } from '../repositories/interfaces.js';
import { env } from '../config/env.js';
import { ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Sequential request-code generator: PAY-10001, PAY-10002, ...
 *
 * Concurrency limitation with Google Sheets:
 * Two concurrent processes may read the same "latest" code and collide.
 * The repository performs a uniqueness check before append; on conflict we retry.
 * For high concurrency, move this to a DB sequence / transactional counter.
 */
export class RequestCodeGenerator {
  constructor(
    private readonly payoutRepository: PayoutRepository,
    private readonly prefix = env.REQUEST_CODE_PREFIX,
    private readonly start = env.REQUEST_CODE_START,
  ) {}

  format(sequence: number): string {
    return `${this.prefix.toUpperCase()}-${sequence}`;
  }

  parseSequence(code: string): number | null {
    const pattern = new RegExp(`^${this.prefix.toUpperCase()}-(\\d+)$`, 'i');
    const match = code.match(pattern);
    if (!match) return null;
    return Number(match[1]);
  }

  async peekNext(): Promise<string> {
    const latest = await this.payoutRepository.getLatestRequestCode();
    if (!latest) {
      return this.format(this.start);
    }
    const sequence = this.parseSequence(latest);
    if (sequence === null) {
      return this.format(this.start);
    }
    return this.format(sequence + 1);
  }

  /**
   * Generate a unique code, retrying if another writer raced ahead.
   */
  async generateUnique(maxAttempts = 5): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = await this.peekNext();
      const existing = await this.payoutRepository.getByCode(candidate);
      if (!existing) {
        return candidate;
      }
      logger.warn({ candidate, attempt }, 'Request code collision; retrying');
    }
    throw new ConflictError('Unable to generate a unique payout request code');
  }
}
