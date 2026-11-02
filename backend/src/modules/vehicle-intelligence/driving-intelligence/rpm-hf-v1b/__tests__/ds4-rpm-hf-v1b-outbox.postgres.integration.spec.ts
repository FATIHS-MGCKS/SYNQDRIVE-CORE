import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { DS4_RPM_HF_V1B_ENGINE_VERSION } from '../ds4-rpm-hf-v1b.contract';
import { Ds4RpmHfV1bOutboxRepository } from '../ds4-rpm-hf-v1b-outbox.repository';
import { Ds4RpmHfV1bRunRepository } from '../ds4-rpm-hf-v1b-run.repository';

const DS4_RPM_HF_V1B_POSTGRES_LIVE =
  process.env.DI_V0_S4A_POSTGRES_INTEGRATION === '1' &&
  process.env.DS4_RPM_HF_V1B_POSTGRES_INTEGRATION === '1';

(DS4_RPM_HF_V1B_POSTGRES_LIVE ? describe : describe.skip)('ds4-rpm-hf-v1b shadow outbox (postgres)', () => {
  let db: PrismaClient;
  let outbox: Ds4RpmHfV1bOutboxRepository;
  let runs: Ds4RpmHfV1bRunRepository;
  const orgId = `org-v1b-${randomUUID().slice(0, 8)}`;
  const vehicleId = `veh-v1b-${randomUUID().slice(0, 8)}`;
  const tripId = randomUUID();
  const outboxIds: string[] = [];
  const runIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    outbox = new Ds4RpmHfV1bOutboxRepository(db);
    runs = new Ds4RpmHfV1bRunRepository(db);

    const [{ reg }] = await db.$queryRaw<Array<{ reg: string | null }>>`
      SELECT to_regclass('public.ds4_rpm_hf_v1b_shadow_outbox_v1')::text AS reg`;
    expect(reg).toBe('ds4_rpm_hf_v1b_shadow_outbox_v1');

    const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('ds4_rpm_hf_v1b_shadow_outbox_v1', 'ds4_rpm_hf_v1b_shadow_runs_v1')`;
    const names = new Set(indexes.map((i) => i.indexname));
    expect(names.has('ds4_rpm_hf_v1b_shadow_outbox_trip_engine_uq')).toBe(true);
    expect(names.has('ds4_rpm_hf_v1b_shadow_runs_succeeded_fp_uq')).toBe(true);

    const cols = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ds4_rpm_hf_v1b_shadow_outbox_v1'
        AND column_name IN ('succeeded_input_fingerprint', 'revision_last_probed_at')`;
    const colSet = new Set(cols.map((c) => c.column_name));
    expect(colSet.has('succeeded_input_fingerprint')).toBe(true);
    expect(colSet.has('revision_last_probed_at')).toBe(true);
  });

  afterEach(async () => {
    for (const runId of runIds.splice(0)) {
      await db.$executeRaw`DELETE FROM ds4_rpm_hf_v1b_shadow_runs_v1 WHERE id = ${runId}`;
    }
    for (const outboxId of outboxIds.splice(0)) {
      await db.$executeRaw`DELETE FROM ds4_rpm_hf_v1b_shadow_outbox_v1 WHERE outbox_id = ${outboxId}::uuid`;
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function insertPendingOutbox(): Promise<{ outboxId: string; claimToken: string }> {
    const now = new Date();
    const rows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at
      ) VALUES (
        ${orgId}, ${vehicleId}, ${randomUUID()}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'PENDING', ${now}
      )
      RETURNING outbox_id`;
    const outboxId = rows[0]!.outbox_id;
    outboxIds.push(outboxId);
    const claimed = await outbox.claimBatch(1, now);
    expect(claimed.length).toBe(1);
    return { outboxId, claimToken: claimed[0]!.claimToken };
  }

  it('claims with SKIP LOCKED so concurrent workers do not double-claim one row', async () => {
    const now = new Date();
    const trip = randomUUID();
    const rows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at
      ) VALUES (
        ${orgId}, ${vehicleId}, ${trip}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'PENDING', ${now}
      )
      RETURNING outbox_id`;
    outboxIds.push(rows[0]!.outbox_id);

    const [a, b] = await Promise.all([outbox.claimBatch(1, now), outbox.claimBatch(1, now)]);
    expect(a.length + b.length).toBe(1);
  }, 60_000);

  it('reclaims expired PROCESSING leases with new claim tokens', async () => {
    const now = new Date();
    const trip = randomUUID();
    const staleToken = randomUUID();
    const rows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at,
        claim_token, claim_expires_at, attempt_count
      ) VALUES (
        ${orgId}, ${vehicleId}, ${trip}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'PROCESSING', ${now},
        ${staleToken}, ${new Date(now.getTime() - 5_000)}, 2
      )
      RETURNING outbox_id`;
    const outboxId = rows[0]!.outbox_id;
    outboxIds.push(outboxId);

    const claimed = await outbox.claimBatch(1, now);
    expect(claimed.length).toBe(1);
    expect(claimed[0]!.outboxId).toBe(outboxId);
    expect(claimed[0]!.claimToken).not.toBe(staleToken);
    expect(claimed[0]!.attemptCount).toBe(3);
  }, 60_000);

  it('fences stale workers via claim_token on markSucceeded', async () => {
    const { outboxId } = await insertPendingOutbox();
    const ok = await outbox.markSucceeded(outboxId, 'wrong-token', 'fp-a');
    expect(ok).toBe(false);
    const [{ status }] = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM ds4_rpm_hf_v1b_shadow_outbox_v1 WHERE outbox_id = ${outboxId}::uuid`;
    expect(status).toBe('PROCESSING');
  }, 60_000);

  it('persists idempotent duplicate SUCCEEDED runs on same fingerprint', async () => {
    const fp = `fp-${randomUUID()}`;
    const trip = randomUUID();
    const runId1 = randomUUID();
    const runId2 = randomUUID();
    runIds.push(runId1, runId2);
    const summary = { contractVersion: 'ds4-rpm-hf-v1b-v1', inputFingerprint: fp };
    const first = await runs.insertRun({
      runId: runId1,
      organizationId: orgId,
      vehicleId,
      tripId: trip,
      engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
      inputFingerprint: fp,
      shadowStatus: 'SUCCEEDED',
      summary: summary as never,
      computedAt: new Date(),
    });
    expect(first.outcome).toBe('inserted');
    const second = await runs.insertRun({
      runId: runId2,
      organizationId: orgId,
      vehicleId,
      tripId: trip,
      engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
      inputFingerprint: fp,
      shadowStatus: 'SUCCEEDED',
      summary: summary as never,
      computedAt: new Date(),
    });
    expect(second.outcome).toBe('idempotent_duplicate');
  }, 60_000);

  it('allows versioned SUCCEEDED runs for different fingerprints on same trip', async () => {
    const trip = randomUUID();
    const runId1 = randomUUID();
    const runId2 = randomUUID();
    runIds.push(runId1, runId2);
    const base = {
      organizationId: orgId,
      vehicleId,
      tripId: trip,
      engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
      shadowStatus: 'SUCCEEDED' as const,
      computedAt: new Date(),
    };
    const r1 = await runs.insertRun({
      ...base,
      runId: runId1,
      inputFingerprint: 'fp-rev-a',
      summary: { inputFingerprint: 'fp-rev-a' } as never,
    });
    const r2 = await runs.insertRun({
      ...base,
      runId: runId2,
      inputFingerprint: 'fp-rev-b',
      summary: { inputFingerprint: 'fp-rev-b' } as never,
    });
    expect(r1.outcome).toBe('inserted');
    expect(r2.outcome).toBe('inserted');
  }, 60_000);

  it('reopens SUCCEEDED outbox for bounded input revision', async () => {
    const now = new Date();
    const trip = randomUUID();
    const rows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at,
        succeeded_input_fingerprint
      ) VALUES (
        ${orgId}, ${vehicleId}, ${trip}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'SUCCEEDED', ${now},
        'fp-old'
      )
      RETURNING outbox_id`;
    const outboxId = rows[0]!.outbox_id;
    outboxIds.push(outboxId);
    const reopened = await outbox.reopenForInputRevision(outboxId, now);
    expect(reopened).toBe(true);
    const [{ status }] = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM ds4_rpm_hf_v1b_shadow_outbox_v1 WHERE outbox_id = ${outboxId}::uuid`;
    expect(status).toBe('PENDING');
  }, 60_000);

  it('blocks stale worker SUCCEEDED run insert after lease reclaim', async () => {
    const now = new Date();
    const trip = randomUUID();
    const staleToken = randomUUID();
    const rows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at,
        claim_token, claim_expires_at, attempt_count
      ) VALUES (
        ${orgId}, ${vehicleId}, ${trip}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'PROCESSING', ${now},
        ${staleToken}, ${new Date(now.getTime() - 5_000)}, 1
      )
      RETURNING outbox_id`;
    const outboxId = rows[0]!.outbox_id;
    outboxIds.push(outboxId);

    const reclaimed = await outbox.claimBatch(1, now);
    expect(reclaimed.length).toBe(1);
    const liveToken = reclaimed[0]!.claimToken;

    const staleInsert = await runs.insertRunWithActiveClaim({
      outboxId,
      claimToken: staleToken,
      runId: randomUUID(),
      organizationId: orgId,
      vehicleId,
      tripId: trip,
      engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
      inputFingerprint: 'fp-stale',
      shadowStatus: 'SUCCEEDED',
      summary: { inputFingerprint: 'fp-stale' } as never,
      computedAt: now,
      now,
    });
    expect(staleInsert.outcome).toBe('claim_lost');

    const liveInsert = await runs.insertRunWithActiveClaim({
      outboxId,
      claimToken: liveToken,
      runId: randomUUID(),
      organizationId: orgId,
      vehicleId,
      tripId: trip,
      engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
      inputFingerprint: 'fp-live',
      shadowStatus: 'SUCCEEDED',
      summary: { inputFingerprint: 'fp-live' } as never,
      computedAt: now,
      now,
    });
    expect(liveInsert.outcome).toBe('inserted');
    if (liveInsert.outcome === 'inserted') {
      runIds.push(liveInsert.runId);
    }
  }, 60_000);

  it('orders revision probe by revision_last_probed_at NULLS FIRST then touch cursor', async () => {
    const now = new Date();
    const tripA = randomUUID();
    const tripB = randomUUID();
    const rowsA = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at,
        succeeded_input_fingerprint, revision_last_probed_at, updated_at
      ) VALUES (
        ${orgId}, ${vehicleId}, ${tripA}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'SUCCEEDED', ${now},
        'fp-a', ${new Date(now.getTime() - 60_000)}, ${now}
      )
      RETURNING outbox_id`;
    const rowsB = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at,
        succeeded_input_fingerprint, revision_last_probed_at, updated_at
      ) VALUES (
        ${orgId}, ${vehicleId}, ${tripB}, ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'SUCCEEDED', ${now},
        'fp-b', NULL, ${now}
      )
      RETURNING outbox_id`;
    const outboxA = rowsA[0]!.outbox_id;
    const outboxB = rowsB[0]!.outbox_id;
    outboxIds.push(outboxA, outboxB);

    const first = await outbox.listSucceededForRevisionProbe({
      organizationAllowlist: [orgId],
      vehicleAllowlist: [vehicleId],
      limit: 2,
    });
    expect(first[0]!.outboxId).toBe(outboxB);

    await outbox.touchRevisionProbe(outboxB, now);
    const second = await outbox.listSucceededForRevisionProbe({
      organizationAllowlist: [orgId],
      vehicleAllowlist: [vehicleId],
      limit: 2,
    });
    expect(second[0]!.outboxId).toBe(outboxA);
  }, 60_000);

  it('transitions FAILED_RETRYABLE and respects tenant-scoped rows', async () => {
    const now = new Date();
    const { outboxId, claimToken } = await insertPendingOutbox();
    const next = new Date(now.getTime() + 60_000);
    const deferred = await outbox.markFailedRetryable(outboxId, claimToken, 'HF_RPM_DATA_MISSING', next);
    expect(deferred).toBe(true);
    const otherOrgTrip = randomUUID();
    const otherRows = await db.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at
      ) VALUES (
        ${`org-other-${randomUUID().slice(0, 6)}`}, ${vehicleId}, ${otherOrgTrip},
        ${DS4_RPM_HF_V1B_ENGINE_VERSION}, 'PENDING', ${now}
      )
      RETURNING outbox_id`;
    outboxIds.push(otherRows[0]!.outbox_id);
    const probes = await outbox.listSucceededForRevisionProbe({
      organizationAllowlist: [orgId],
      vehicleAllowlist: [vehicleId],
      limit: 10,
    });
    expect(probes.every((p) => p.organizationId === orgId)).toBe(true);
  }, 60_000);
});
