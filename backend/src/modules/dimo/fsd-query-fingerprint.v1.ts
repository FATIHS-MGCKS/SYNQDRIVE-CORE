import { createHash } from 'node:crypto';

/** Shared with FSD query documents — lives under dimo/ to avoid dimo importing the FSD planner package. */
export function normalizeFsdQueryTextForFingerprintV1(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function computeFsdQueryFingerprintV1(normalizedQueryText: string): string {
  return createHash('sha256').update(normalizedQueryText, 'utf8').digest('hex');
}
