import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDiBoundaryAdmissionService } from '../../../trips/di-boundary-admission/trip-di-boundary-admission.service';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { DS4_ASSESSMENT_FLEET_VEHICLES_V1 } from '../ds4-assessment-fleet-admission.v1';
import { Ds4AssessmentOutboxRepositoryV1 } from '../ds4-assessment-outbox.repository.v1';
import { Ds4AssessmentProcessorServiceV1 } from '../ds4-assessment-processor.service.v1';
import { Ds4AssessmentServiceV1 } from '../ds4-assessment.service.v1';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from '../ds4-trip-assessment-v1.contract';
import {
  bindDs4TenantToFleetVehicle,
  ds4PinnedEvidenceStub,
  DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF,
  DS4_POSTGRES_LIVE,
  seedDs4PostgresTenant,
} from './ds4-assessment-postgres-harness';
import { DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';

const describePg =
  process.env.DI_V0_DS4_ASSESSMENT_POSTGRES_INTEGRATION === '1' && DS4_POSTGRES_LIVE ? describe : describe.skip;

describePg('ds4-assessment worker postgres integration', () => {
  let db: PrismaClient;
  let outbox: Ds4AssessmentOutboxRepositoryV1;
  let processor: Ds4AssessmentProcessorServiceV1;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient();
    outbox = new Ds4AssessmentOutboxRepositoryV1(db);
    processor = new Ds4AssessmentProcessorServiceV1(
      db as unknown as PrismaService,
      new TripDiBoundaryAdmissionService(db as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1`;
  });

  function buildValidPayload(contentFingerprint: string) {
    return {
      contract: {
        algorithmVersions: {
          c4: 'c4',
          c5_1: null,
          c5_1ProductionSafety: null,
          c5_1AlgorithmFileSha256: null,
          fsm: 'fsm',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: 'ev',
          bundle: 'b1',
        },
        speedAuthority: 'C4_ONLY',
        persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
        timeSemantics: {
          processingMode: 'POST_TRIP_RETROSPECTIVE',
          c4ValueSupportForwardS: 1,
          c4FullFinalizationForwardS: 1,
          fsmMode: 'RETROSPECTIVE',
          eventFinalizationNote: 'test',
          computedAtUtc: '2026-01-01T00:00:00.000Z',
        },
        sparse: { channelOutcome: null, comparable: false, sampleCount: 0, samples: [], limitations: [] },
        comparisonHints: {
          artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
          inferredNeverPromotedToDirect: true,
          unknownNotCountedAsConfirmedStandstill: true,
        },
      },
      speeds: [],
      fsmLabels: [
        {
          bucketLabelUtc: '2026-01-01T10:00:00Z',
          state: 'MOVING',
          evidenceQuality: 'DIRECT',
          reason: 'r',
          flags: [],
        },
      ],
      stopEpisodes: [],
      events: [],
      summary: {
        labelCount: 1,
        speedNumericCount: 0,
        eventCount: 0,
        eventAcceptedCount: 0,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: 0,
        contentFingerprint,
      },
    };
  }

  async function insertMotionRun(input: {
    runId: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    contentFingerprint: string;
    payloadGzip: Buffer;
    jsonLength: number;
    createdAt: Date;
    summaryJson: object;
  }) {
    await db.$executeRaw`
      INSERT INTO di_v0_motion_core_shadow_runs_v1 (
        id, organization_id, vehicle_id, trip_id, work_item_id, shadow_intent_key, shadow_bundle_version,
        pinned_snapshot_hash, combined_input_identity, content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes, created_at
      ) VALUES (
        ${input.runId}, ${input.organizationId}, ${input.vehicleId}, ${input.tripId}, ${randomUUID()}, 'test-intent', 'bundle-v1',
        ${`pin-${input.contentFingerprint}`}, ${`ident-${input.contentFingerprint}`}, ${input.contentFingerprint}, 'SUCCEEDED',
        ${JSON.stringify(input.summaryJson)}::jsonb, ${input.payloadGzip}, ${input.jsonLength}, ${input.createdAt}
      )`;
  }

  function discoverInput(limit: number, now: Date) {
    return {
      limit,
      now,
      minMotionRunCreatedAt: DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF,
    };
  }

  it('discoverFromSucceededMotionRuns terminals poisoned oldest rows and enqueues valid runs', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[1]!;
    const tenant = await bindDs4TenantToFleetVehicle(db, await seedDs4PostgresTenant(db), fleet);
    const tripId = tenant.tripId;
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;

    const now = new Date('2026-10-28T10:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      const runId = randomUUID();
      await insertMotionRun({
        runId,
        organizationId: fleet.organizationId,
        vehicleId: fleet.vehicleId,
        tripId,
        contentFingerprint: `poison-${i}`,
        payloadGzip: Buffer.from('not-valid-gzip'),
        jsonLength: 0,
        createdAt: new Date(now.getTime() + i * 1000),
        summaryJson: {
          contentFingerprint: `poison-${i}`,
          eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
        },
      });
    }

    const validRunId = randomUUID();
    const fp = 'valid-run-fp';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await insertMotionRun({
      runId: validRunId,
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip,
      jsonLength: json.length,
      createdAt: new Date(now.getTime() + 60_000),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });

    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(10, now));
    expect(discovered).toBe(6);

    const terminalRows = await db.diV0Ds4AssessmentOutboxV1.findMany({
      where: { tripId, status: 'SKIPPED_INELIGIBLE' },
    });
    expect(terminalRows.length).toBe(5);
    expect(terminalRows.every((r) => r.lastErrorCode === 'DISCOVERY_PAYLOAD_REQUIRED')).toBe(true);

    const pending = await db.diV0Ds4AssessmentOutboxV1.findFirst({
      where: { sourceMotionRunId: validRunId, status: 'PENDING' },
    });
    expect(pending?.assessmentVersion).toBe(DS4_TRIP_ASSESSMENT_VERSION_V1);

    const rediscover = await outbox.discoverFromSucceededMotionRuns(discoverInput(10, now));
    expect(rediscover).toBe(0);
  });

  it('processMotionRun persists assessment and impact for a valid motion run', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[2]!;
    const tenant = await bindDs4TenantToFleetVehicle(db, await seedDs4PostgresTenant(db), fleet);
    const tripId = tenant.tripId;
    const bundle = ds4PinnedEvidenceStub('processor');
    const runId = randomUUID();
    const fp = 'processor-fp';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE id = ${runId}`;
    await insertMotionRun({
      runId,
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip,
      jsonLength: json.length,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });

    const result = await processor.processMotionRun({
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('ok');

    const assessment = await db.diV0Ds4TripAssessmentV1.findFirst({ where: { tripId, sourceMotionRunId: runId } });
    expect(assessment).not.toBeNull();
    const impact = await db.diV0Ds4TripDrivingImpactV2.findFirst({ where: { tripId, assessmentId: assessment!.id } });
    expect(impact?.operationalLoadIndex).toBeNull();
  });

  it('runPass discovers, claims and completes a worker cycle when flags are enabled', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[3]!;
    const tenant = await bindDs4TenantToFleetVehicle(db, await seedDs4PostgresTenant(db), fleet);
    const tripId = tenant.tripId;
    const runId = randomUUID();
    const fp = 'runpass-fp';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;
    await insertMotionRun({
      runId,
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip,
      jsonLength: json.length,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });

    const prevEnabled = process.env.DI_V0_DS4_ASSESSMENT_ENABLED;
    const prevWorker = process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED;
    const prevCutoff = process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT;
    process.env.DI_V0_DS4_ASSESSMENT_ENABLED = '1';
    process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED = '1';
    process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT = DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF.toISOString();
    const liveProcessor = new Ds4AssessmentProcessorServiceV1(
      db as unknown as PrismaService,
      new TripDiBoundaryAdmissionService(db as unknown as PrismaService),
    );
    const liveService = new Ds4AssessmentServiceV1(db as unknown as PrismaService, liveProcessor);
    try {
      const pass = await liveService.runPass(new Date());
      expect(pass.configured).toBe(true);
      expect(pass.claimed).toBeGreaterThanOrEqual(1);
      expect(pass.succeeded).toBeGreaterThanOrEqual(1);
    } finally {
      process.env.DI_V0_DS4_ASSESSMENT_ENABLED = prevEnabled;
      process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED = prevWorker;
      process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT = prevCutoff;
    }

    const outboxRow = await db.diV0Ds4AssessmentOutboxV1.findFirst({
      where: { sourceMotionRunId: runId, assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1 },
    });
    expect(outboxRow?.status).toBe('SUCCEEDED');
  });

  it('does not rediscover a source run when a terminal outbox row exists for the assessment version', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[0]!;
    const tenant = await bindDs4TenantToFleetVehicle(db, await seedDs4PostgresTenant(db), fleet);
    const tripId = tenant.tripId;
    const runId = randomUUID();
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1 WHERE source_motion_run_id = ${runId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE id = ${runId}`;

    await insertMotionRun({
      runId,
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
      contentFingerprint: 'terminal-only',
      payloadGzip: Buffer.from('bad'),
      jsonLength: 0,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
      summaryJson: { contentFingerprint: 'terminal-only' },
    });

    const terminal = await outbox.persistDiscoveryTerminalOutbox({
      sourceMotionRunId: runId,
      organizationId: fleet.organizationId,
      tripId,
      vehicleId: fleet.vehicleId,
      reasonCode: 'DISCOVERY_PAYLOAD_REQUIRED',
      now: new Date(),
    });
    expect(terminal).toBe('inserted');

    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(5, new Date()));
    expect(discovered).toBe(0);
  });

  it('discoverFromSucceededMotionRuns enqueues runs for non-calibration onboarded vehicles', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const tripId = tenant.tripId;
    const runId = randomUUID();
    const fp = 'onboard-fp';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`DELETE FROM di_v0_ds4_assessment_outbox_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip,
      jsonLength: json.length,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });

    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(5, new Date()));
    expect(discovered).toBe(1);
    const pending = await db.diV0Ds4AssessmentOutboxV1.findFirst({
      where: { sourceMotionRunId: runId, status: 'PENDING' },
    });
    expect(pending?.vehicleId).toBe(tenant.vehicleId);
  });

  it('excludes motion runs before the configured collection cutoff', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const tripId = tenant.tripId;
    const runId = randomUUID();
    const fp = 'before-cutoff';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip: gzipSync(json),
      jsonLength: json.length,
      createdAt: new Date(DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF.getTime() - 1000),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });
    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(5, new Date()));
    expect(discovered).toBe(0);
  });

  it('includes V2 motion runs exactly at the collection cutoff boundary', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const tripId = tenant.tripId;
    const runId = randomUUID();
    const fp = 'at-cutoff';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip: gzipSync(json),
      jsonLength: json.length,
      createdAt: new Date(DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
    });
    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(5, new Date()));
    expect(discovered).toBe(1);
  });

  it('does not let legacy V1 runs consume discovery batch capacity', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const tripId = tenant.tripId;
    for (let i = 0; i < 8; i += 1) {
      await insertMotionRun({
        runId: randomUUID(),
        organizationId: tenant.organizationId,
        vehicleId: tenant.vehicleId,
        tripId,
        contentFingerprint: `legacy-${i}`,
        payloadGzip: gzipSync(JSON.stringify(buildValidPayload(`legacy-${i}`))),
        jsonLength: 100,
        createdAt: new Date(DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF.getTime() + i * 1000),
        summaryJson: { contentFingerprint: `legacy-${i}` },
      });
    }
    const v2RunId = randomUUID();
    const fp = 'v2-only';
    const payload = buildValidPayload(fp);
    const json = JSON.stringify(payload);
    await insertMotionRun({
      runId: v2RunId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId,
      contentFingerprint: fp,
      payloadGzip: gzipSync(json),
      jsonLength: json.length,
      createdAt: new Date(DS4_ASSESSMENT_TEST_COLLECTION_CUTOFF.getTime() + 60_000),
      summaryJson: {
        contentFingerprint: fp,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
      },
    });
    const discovered = await outbox.discoverFromSucceededMotionRuns(discoverInput(1, new Date()));
    expect(discovered).toBe(1);
    const pending = await db.diV0Ds4AssessmentOutboxV1.findFirst({ where: { sourceMotionRunId: v2RunId } });
    expect(pending?.status).toBe('PENDING');
  });

  it('runPass is not configured when worker flags are set without collection cutoff', async () => {
    const prevEnabled = process.env.DI_V0_DS4_ASSESSMENT_ENABLED;
    const prevWorker = process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED;
    const prevCutoff = process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT;
    process.env.DI_V0_DS4_ASSESSMENT_ENABLED = '1';
    process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED = '1';
    delete process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT;
    const liveProcessor = new Ds4AssessmentProcessorServiceV1(
      db as unknown as PrismaService,
      new TripDiBoundaryAdmissionService(db as unknown as PrismaService),
    );
    const liveService = new Ds4AssessmentServiceV1(db as unknown as PrismaService, liveProcessor);
    try {
      const pass = await liveService.runPass(new Date());
      expect(pass.configured).toBe(false);
      expect(pass.discovered).toBe(0);
    } finally {
      process.env.DI_V0_DS4_ASSESSMENT_ENABLED = prevEnabled;
      process.env.DI_V0_DS4_ASSESSMENT_WORKER_ENABLED = prevWorker;
      process.env.DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT = prevCutoff;
    }
  });
});
