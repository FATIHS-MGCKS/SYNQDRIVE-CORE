import { BadRequestException } from '@nestjs/common';
import { RentalTripLinkCreatedBy, RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import type { PrismaService } from '@shared/database/prisma.service';

describe('RentalTripLinkRepository', () => {
  const orgId = 'org-1';
  const tripId = 'trip-1';
  const bookingId = 'booking-1';
  const vehicleId = 'vehicle-1';

  function mockTx() {
    const overlayRows: Array<Record<string, unknown>> = [];
    return {
      rentalTripLink: {
        findFirst: jest.fn().mockImplementation(async () =>
          overlayRows.find((r) => r.supersededAt == null) ?? null,
        ),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `rtl-${overlayRows.length + 1}`, ...data };
          overlayRows.push(row);
          return row;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = overlayRows.findIndex((r) => r.id === where.id);
          overlayRows[idx] = { ...overlayRows[idx], ...data };
          return overlayRows[idx];
        }),
      },
      _rows: overlayRows,
    };
  }

  it('supersedes prior current and keeps single active decision', async () => {
    const tx = mockTx();
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({ id: tripId, vehicleId }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: bookingId, organizationId: orgId, vehicleId }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new RentalTripLinkRepository(prisma);
    const first = await repo.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId,
      linkSource: TripBookingLinkSource.EXPLICIT,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    const second = await repo.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId,
      status: RentalTripLinkStatus.UNLINKED,
      createdBy: RentalTripLinkCreatedBy.USER,
    });

    expect(first.status).toBe(RentalTripLinkStatus.ACTIVE);
    expect(second.status).toBe(RentalTripLinkStatus.UNLINKED);
    const superseded = tx._rows.find((r) => r.id === first.id);
    expect(superseded?.status).toBe(RentalTripLinkStatus.SUPERSEDED);
    expect(superseded?.supersededById).toBe(second.id);
    const currents = tx._rows.filter((r) => r.supersededAt == null);
    expect(currents).toHaveLength(1);
  });

  it('rejects TIME_WINDOW supersession over EXPLICIT current', async () => {
    const tx = mockTx();
    await tx.rentalTripLink.create({
      data: {
        id: 'rtl-explicit',
        organizationId: orgId,
        tripId,
        bookingId,
        status: RentalTripLinkStatus.ACTIVE,
        linkSource: TripBookingLinkSource.EXPLICIT,
        supersededAt: null,
      },
    });

    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({ id: tripId, vehicleId }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: bookingId, organizationId: orgId, vehicleId }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new RentalTripLinkRepository(prisma);
    await expect(
      repo.supersedeAndEstablishCurrent({
        organizationId: orgId,
        tripId,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: 'booking-2',
        linkSource: TripBookingLinkSource.TIME_WINDOW,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
