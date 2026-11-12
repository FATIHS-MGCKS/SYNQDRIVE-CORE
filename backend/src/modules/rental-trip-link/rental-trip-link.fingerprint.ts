import { createHash } from 'crypto';
import type { TripBookingLinkSource } from '@prisma/client';

export function buildLegacyTripLinkFingerprint(input: {
  assignedBookingId: string | null;
  bookingLinkSource: TripBookingLinkSource | null;
  bookingCustomerId: string | null;
}): string | null {
  if (!input.assignedBookingId) {
    return null;
  }
  const payload = [
    input.assignedBookingId,
    input.bookingLinkSource ?? 'NONE',
    input.bookingCustomerId ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
