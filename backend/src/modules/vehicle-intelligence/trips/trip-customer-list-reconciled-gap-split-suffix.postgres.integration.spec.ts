import { PrismaClient } from '@prisma/client';
import {
  cleanupCustomerGapSplitPostgresFixture,
  countAllTripsForVehicleDay,
  countCustomerVisibleTripsForVehicleDay,
  createCustomerGapSplitPostgresFixture,
  probeCustomerGapSplitPostgresDatabase,
  type CustomerGapSplitPostgresFixture,
} from './testing/customer-gap-split-list-postgres.integration.harness';
import {
  applyHiddenCustomerSuffixTripExclusion,
  listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList,
} from './trip-customer-list-reconciled-gap-split-suffix.util';
import { scopedVehicleTripWhere } from '../tenant/vehicle-intelligence-tenant.scope';

const LIVE = process.env.TRIP_CUSTOMER_LIST_GAP_SPLIT_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Customer gap-split suffix list filter (PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: CustomerGapSplitPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeCustomerGapSplitPostgresDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createCustomerGapSplitPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupCustomerGapSplitPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it('Tiguan 2026-10-31 — customer-visible day count 2→1; DB rows unchanged', async () => {
      if (!dbOk) return;
      const allRows = await countAllTripsForVehicleDay(
        prisma,
        fixture.vehicleId,
        fixture.dayFrom,
        fixture.dayTo,
      );
      expect(allRows).toBeGreaterThanOrEqual(2);

      const visible = await countCustomerVisibleTripsForVehicleDay(
        prisma,
        fixture.orgId,
        fixture.vehicleId,
        fixture.dayFrom,
        fixture.dayTo,
      );
      const hidden = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
        prisma,
        fixture.vehicleId,
        { from: fixture.dayFrom, to: fixture.dayTo },
      );

      expect(hidden).toContain(fixture.absorbedSuffixId);
      expect(hidden).not.toContain(fixture.canonicalTripId);
      expect(hidden).not.toContain(fixture.independentCancelledId);
      expect(visible).toBe(allRows - hidden.length);

      const incidentVisible = await prisma.vehicleTrip.count({
        where: applyHiddenCustomerSuffixTripExclusion(
          {
            vehicleId: fixture.vehicleId,
            id: { in: [fixture.canonicalTripId, fixture.absorbedSuffixId] },
          },
          hidden,
        ),
      });
      expect(incidentVisible).toBe(1);

      const physical = await prisma.vehicleTrip.count({
        where: { vehicleId: fixture.vehicleId },
      });
      expect(physical).toBe(allRows);
    });

    it('does not hide suffix when parent lacks explicit PARTIAL_TRIP_BOUNDARY_EXTENSION', async () => {
      if (!dbOk) return;
      const hidden = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
        prisma,
        fixture.vehicleId,
      );
      expect(hidden).not.toContain(fixture.malformedAnchorSuffixId);
    });

    it('does not hide independent CANCELLED too_short trip', async () => {
      if (!dbOk) return;
      const hidden = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
        prisma,
        fixture.vehicleId,
        { from: fixture.dayFrom, to: fixture.dayTo },
      );
      expect(hidden).not.toContain(fixture.independentCancelledId);
    });

    it('malformed splitSecondStartAt on another parent does not fail the SQL path', async () => {
      if (!dbOk) return;
      await expect(
        listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(prisma, fixture.vehicleId),
      ).resolves.toBeInstanceOf(Array);
    });

    it('stats-style aggregate excludes hidden suffix from totalTrips count', async () => {
      if (!dbOk) return;
      const hidden = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
        prisma,
        fixture.vehicleId,
      );
      const where = applyHiddenCustomerSuffixTripExclusion(
        scopedVehicleTripWhere(fixture.orgId, fixture.vehicleId),
        hidden,
      );
      const visibleTotal = await prisma.vehicleTrip.count({ where });
      const allTrips = await prisma.vehicleTrip.count({
        where: { vehicleId: fixture.vehicleId, vehicle: { organizationId: fixture.orgId } },
      });
      expect(visibleTotal).toBe(allTrips - hidden.length);
    });
  },
);
