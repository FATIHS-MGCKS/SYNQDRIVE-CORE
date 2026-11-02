import type { PrismaService } from '@shared/database/prisma.service';
import { resolveCanonicalTripForRpmHfV1a } from '../ds4-rpm-hf-v1a-trip-identity';

describe('resolveCanonicalTripForRpmHfV1a', () => {
  it('returns canonical times for COMPLETED trip', async () => {
    const start = new Date('2026-10-27T10:00:00.000Z');
    const end = new Date('2026-10-27T10:30:00.000Z');
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn(async () => ({
          id: 'trip-1',
          vehicleId: 'veh-1',
          tripStatus: 'COMPLETED',
          startTime: start,
          endTime: end,
          vehicle: { organizationId: 'org-1' },
        })),
      },
    } as unknown as PrismaService;

    const result = await resolveCanonicalTripForRpmHfV1a(prisma, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trip.startTime).toEqual(start);
      expect(result.trip.endTime).toEqual(end);
    }
  });

  it('fail-closed when trip not COMPLETED', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn(async () => ({
          id: 'trip-1',
          vehicleId: 'veh-1',
          tripStatus: 'ONGOING',
          startTime: new Date(),
          endTime: null,
          vehicle: { organizationId: 'org-1' },
        })),
      },
    } as unknown as PrismaService;

    const result = await resolveCanonicalTripForRpmHfV1a(prisma, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('TRIP_NOT_COMPLETED');
    }
  });
});
