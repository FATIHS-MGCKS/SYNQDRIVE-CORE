import { PrismaClient, TripDetectionState } from '@prisma/client';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { buildTripEndValidationObservationRow } from './trip-end-validation-observability.domain';
import {
  computeRetentionCutoff,
  TripEndValidationObservabilityRetentionService,
} from './trip-end-validation-observability-retention.service';
import { TDL_EV_OBS_RETENTION_SKIP_REASON } from './trip-end-validation-observability-retention.types';
import { TRIP_END_VALIDATION_OBSERVATION_OUTCOMES } from './trip-end-validation-observability.types';
import { TDL_OBS_TEST_RETENTION_CONFIG } from './trip-end-validation-observability-test.helpers';
import { withTdlEndValidationObservationRetentionAdvisoryLock } from './trip-end-validation-observability-retention-advisory-lock';

const LIVE = process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_INTEGRATION === '1';
const REQUIRED =
  process.env.TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED === '1';

if (REQUIRED && !LIVE) {
  throw new Error(
    'TRIP_END_VALIDATION_OBSERVABILITY_POSTGRES_REQUIRED=1 but integration flag is off',
  );
}

async function tablesReady(prisma: PrismaClient): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ obs: boolean; purge: boolean }>>`
      SELECT
        to_regclass('public.trip_end_validation_decision_observations') IS NOT NULL AS obs,
        to_regclass('public.trip_end_validation_observability_retention_purge_runs') IS NOT NULL AS purge
    `;
    return rows[0]?.obs === true && rows[0]?.purge === true;
  } catch {
    return false;
  }
}

async function createFixture(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `TDL PR1 retention ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `PR1-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'PR1',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true },
  });
  return { org, vehicle };
}

async function insertObservation(
  prisma: PrismaClient,
  params: {
    orgId: string;
    vehicleId: string;
    persistedAt: Date;
    token: string;
  },
) {
  const row = buildTripEndValidationObservationRow({
    organizationId: params.orgId,
    vehicleId: params.vehicleId,
    tripId: null,
    endCycleToken: params.token,
    fsmStateAtDecision: TripDetectionState.POSSIBLE_END,
    processPhase: 'END_VALIDATION',
    decisionOutcome: TRIP_END_VALIDATION_OBSERVATION_OUTCOMES.CUSUM_INCONCLUSIVE_RETRY,
    workerDecisionAt: params.persistedAt,
  });
  return prisma.tripEndValidationDecisionObservation.create({
    data: { ...row, persistedAt: params.persistedAt },
  });
}

function buildRetentionService(
  prisma: PrismaClient,
  config: typeof TDL_OBS_TEST_RETENTION_CONFIG,
  leaderRun = true,
): TripEndValidationObservabilityRetentionService {
  const leaderGuard = {
    shouldRun: jest.fn(() => leaderRun),
  } as unknown as SchedulerLeaderGuardService;
  return new TripEndValidationObservabilityRetentionService(
    prisma as never,
    config,
    leaderGuard,
    new TripMetricsService(),
  );
}

(LIVE ? describe : describe.skip)(
  'trip-end-validation-observability retention (Postgres integration)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let schemaOk = false;

    beforeAll(async () => {
      try {
        prisma = new PrismaClient();
        await prisma.$connect();
        dbOk = true;
        schemaOk = await tablesReady(prisma);
      } catch {
        dbOk = false;
      }
      if (REQUIRED && !dbOk) {
        throw new Error('Postgres probe failed in required CI mode');
      }
      if (REQUIRED && dbOk && !schemaOk) {
        throw new Error('PR0/PR1 observability tables missing — run prisma migrate deploy');
      }
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    afterEach(async () => {
      if (!dbOk || !schemaOk) return;
      await prisma.tripEndValidationDecisionObservation.deleteMany({});
      await prisma.tripEndValidationObservabilityRetentionPurgeRun.deleteMany({});
    });

    it('dry-run counts eligible rows without DELETE', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const cutoff = computeRetentionCutoff(90, now);
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: new Date(cutoff.getTime() - 60_000),
        token: 'old-1',
      });

      const svc = buildRetentionService(prisma, {
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        dryRun: true,
      });
      const report = await svc.runOnce({ trigger: 'manual', now, dryRun: true });
      expect(report.skipped).toBe(false);
      expect(report.eligibleCount).toBe(1);
      expect(report.rowsDeleted).toBe(0);
      expect(
        await prisma.tripEndValidationDecisionObservation.count({
          where: { vehicleId: fixture.vehicle.id },
        }),
      ).toBe(1);

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('deletes only rows older than 90d cutoff and keeps newer rows', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const cutoff = computeRetentionCutoff(90, now);
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: new Date(cutoff.getTime() - 1),
        token: 'eligible',
      });
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: cutoff,
        token: 'boundary-keep',
      });
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: new Date(cutoff.getTime() + 1),
        token: 'young',
      });

      const svc = buildRetentionService(prisma, {
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        dryRun: false,
        batchSize: 100,
      });
      const report = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(report.rowsDeleted).toBe(1);
      const remaining = await prisma.tripEndValidationDecisionObservation.findMany({
        where: { vehicleId: fixture.vehicle.id },
        orderBy: { endCycleToken: 'asc' },
      });
      expect(remaining.map((r) => r.endCycleToken)).toEqual(['boundary-keep', 'young']);

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('purges multiple rows sharing identical persistedAt deterministically', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const shared = new Date(computeRetentionCutoff(90, now).getTime() - 5_000);
      for (let i = 0; i < 3; i++) {
        await insertObservation(prisma, {
          orgId: fixture.org.id,
          vehicleId: fixture.vehicle.id,
          persistedAt: shared,
          token: `same-ts-${i}`,
        });
      }

      const svc = buildRetentionService(prisma, {
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        dryRun: false,
        batchSize: 2,
        maxBatchesPerRun: 10,
      });
      const first = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(first.batchCount).toBeGreaterThanOrEqual(2);
      expect(first.rowsDeleted).toBe(3);
      expect(await prisma.tripEndValidationDecisionObservation.count()).toBe(0);

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('empty table completes with zero eligible rows', async () => {
      if (!dbOk || !schemaOk) return;
      const svc = buildRetentionService(prisma, TDL_OBS_TEST_RETENTION_CONFIG);
      const report = await svc.runOnce({
        trigger: 'manual',
        now: new Date('2026-11-02T12:00:00.000Z'),
      });
      expect(report.skipped).toBe(false);
      expect(report.eligibleCount).toBe(0);
      expect(report.rowsDeleted).toBe(0);
    });

    it('repeated purge is idempotent', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const old = new Date(computeRetentionCutoff(90, now).getTime() - 1000);
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: old,
        token: 'once',
      });
      const cfg = { ...TDL_OBS_TEST_RETENTION_CONFIG, dryRun: false };
      const svc = buildRetentionService(prisma, cfg);
      const r1 = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      const r2 = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(r1.rowsDeleted).toBe(1);
      expect(r2.rowsDeleted).toBe(0);
      expect(r2.eligibleCount).toBe(0);

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('respects maxBatchesPerRun cap (resumable next run)', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const old = new Date(computeRetentionCutoff(90, now).getTime() - 1000);
      for (let i = 0; i < 5; i++) {
        await insertObservation(prisma, {
          orgId: fixture.org.id,
          vehicleId: fixture.vehicle.id,
          persistedAt: old,
          token: `batch-${i}`,
        });
      }
      const svc = buildRetentionService(prisma, {
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        dryRun: false,
        batchSize: 2,
        maxBatchesPerRun: 1,
      });
      const partial = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(partial.rowsDeleted).toBe(2);
      expect(partial.batchCount).toBe(1);
      const second = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(second.rowsDeleted).toBe(2);
      const finish = await svc.runOnce({ trigger: 'manual', now, dryRun: false });
      expect(finish.rowsDeleted).toBe(1);

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('skips on follower replica (leader guard)', async () => {
      if (!dbOk || !schemaOk) return;
      const svc = buildRetentionService(prisma, TDL_OBS_TEST_RETENTION_CONFIG, false);
      const report = await svc.runOnce({ trigger: 'cron' });
      expect(report.skipReason).toBe(TDL_EV_OBS_RETENTION_SKIP_REASON.LEADER_SKIP);
    });

    it('serializes concurrent purge via PostgreSQL advisory lock', async () => {
      if (!dbOk || !schemaOk) return;
      const fixture = await createFixture(prisma);
      const now = new Date('2026-11-02T12:00:00.000Z');
      const old = new Date(computeRetentionCutoff(90, now).getTime() - 1000);
      await insertObservation(prisma, {
        orgId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        persistedAt: old,
        token: 'lock-test',
      });
      const cfg = { ...TDL_OBS_TEST_RETENTION_CONFIG, dryRun: false };
      const prismaPeer = new PrismaClient();
      await prismaPeer.$connect();
      const contendedSvc = buildRetentionService(prismaPeer, cfg);
      const runnerSvc = buildRetentionService(prisma, cfg);

      try {
        const lockOutcome = await withTdlEndValidationObservationRetentionAdvisoryLock(
          prisma as never,
          async () => {
            const report = await contendedSvc.runOnce({ trigger: 'manual', now, dryRun: false });
            expect(report.skipReason).toBe(TDL_EV_OBS_RETENTION_SKIP_REASON.LOCK_CONTENTED);
            return report;
          },
        );
        expect(lockOutcome.acquired).toBe(true);

        const completed = await runnerSvc.runOnce({ trigger: 'manual', now, dryRun: false });
        expect(completed.skipped).toBe(false);
        expect(completed.rowsDeleted).toBe(1);
      } finally {
        await prismaPeer.$disconnect().catch(() => undefined);
      }

      await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } });
      await prisma.organization.delete({ where: { id: fixture.org.id } });
    });

    it('fail-closed on invalid retention configuration', async () => {
      if (!dbOk || !schemaOk) return;
      const svc = buildRetentionService(prisma, {
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        retentionDays: 89,
      });
      const report = await svc.runOnce({ trigger: 'manual' });
      expect(report.skipReason).toBe(TDL_EV_OBS_RETENTION_SKIP_REASON.INVALID_CONFIG);
    });

    it('records last successful purge in audit table', async () => {
      if (!dbOk || !schemaOk) return;
      const svc = buildRetentionService(prisma, TDL_OBS_TEST_RETENTION_CONFIG);
      const report = await svc.runOnce({
        trigger: 'manual',
        now: new Date('2026-11-02T12:00:00.000Z'),
      });
      expect(report.skipped).toBe(false);
      const last = await svc.getLastSuccessfulPurgeFinishedAt();
      expect(last).toBeInstanceOf(Date);
    });
  },
);
