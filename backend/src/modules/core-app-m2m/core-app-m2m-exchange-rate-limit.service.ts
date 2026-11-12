import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

/**
 * In-memory rate limiter for core-app token exchange (per client IP).
 * P1B-PR1 minimal scope — not distributed across replicas.
 */
@Injectable()
export class CoreAppM2mExchangeRateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000;
  private readonly maxPerWindow = 20;

  assertAllowed(ipKey: string): void {
    const key = ipKey || 'unknown';
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (bucket.count >= this.maxPerWindow) {
      throw new HttpException('Too many token exchange attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count += 1;
  }

  resetForTests(): void {
    this.buckets.clear();
  }
}
