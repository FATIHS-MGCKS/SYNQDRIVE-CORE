/**
 * VSI P3 signal fingerprint + quality (disposable PostgreSQL).
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import {
  PrismaClient,
  DrivingCapabilityStatus,
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
  VehicleProviderSourceTimestampProvenance,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { isVsiProfileSignalFingerprintV1 } from './vsi-signal-fingerprint.enricher';
import { loadVsiBundleHistoricalEvidence } from './vsi-profile-historical-evidence.loader';
import { VSI_LIMITATION_PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT } from './vsi-profile-empirical.constants';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-fp-test' },
  syntheticDevice: null,
};

async function upsertVls(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
    lv?: number | null;
    evSoc?: number | null;
    rawPayloadJson: object;
  },
) {
  const id = randomUUID();
  const raw = JSON.stringify(input.rawPayloadJson);
  await prisma.$executeRaw`
    INSERT INTO vehicle_latest_states (
      id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
      provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
    ) VALUES (
      ${id}::uuid,
      ${input.vehicleId},
      true,
      ${input.lv ?? null},
      ${input.evSoc ?? null},
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      ev_soc = EXCLUDED.ev_soc,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

async function seedBundleHistory(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    linkId: string;
    timestamps: Date[];
  },
) {
  let idx = 1n;
  for (const ts of input.timestamps) {
    await prisma.vehicleProviderSourceObservation.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        providerBindingId: input.linkId,
        providerBindingScopeKey: input.linkId,
        providerTokenReference: 'tok',
        providerTokenScopeKey: 'tok',
        pollJobId: `poll-${idx}`,
        bullmqAttemptNumber: 0,
        fetchCorrelationId: randomUUID(),
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
        idempotencyKey: `fp-test:${input.linkId}:${idx}`,
        observationIndex: idx,
        providerFetchedAt: new Date(ts.getTime() + 1000),
        providerSourceTimestamp: ts,
        sourceTimestampProvenance: VehicleProviderSourceTimestampProvenance.PROVIDER_LAST_SEEN,
        observationOutcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
      },
    });
    idx += 1n;
  }
}

(LIVE ? describe : describe.skip)('VSI P3 profile signal fingerprint (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared, createNoopVsiProfileCadenceEvidenceLoader());

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupOrg(organizationId: string) {
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.vehicleProviderSourceObservation.deleteMany({ where: { organizationId } });
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const ids = vehicles.map((v) => v.id);
    if (ids.length) {
      await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDrivingCapability.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  it('materializes v2 fingerprint with OBSERVED_FRESH LV for Ruptela', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
      metadata: {
        connectionIdentity: {
          version: 'vo-source-link-connection-identity-v1',
          verifiedModality: 'HARDWARE_DEVICE',
          telemetrySourceFamily: 'RUPTELA_R1',
        },
      },
    });
    const ts = new Date('2026-10-15T12:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01.000Z'),
      lv: 12.4,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: ts.toISOString() },
        speed: { value: 40, timestamp: ts.toISOString() },
      },
    });
    await prisma.vehicleDrivingCapability.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        hardwareProfile: 'LTE_R1',
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName: 'lowVoltageBatteryCurrentVoltage',
        capabilityKey: 'lowVoltageBatteryCurrentVoltage',
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        firstSeenAt: ts,
        lastSeenAt: ts,
        checkedAt: ts,
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      },
    });
    await seedBundleHistory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      timestamps: [
        new Date('2026-10-15T11:00:00.000Z'),
        new Date('2026-10-15T11:05:00.000Z'),
        new Date('2026-10-15T11:10:00.000Z'),
        new Date('2026-10-15T12:00:00.000Z'),
      ],
    });

    const result = await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(result?.contractVersion).toBe('vsi-signal-profile-v2');
    const lv = result?.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv && isVsiProfileSignalFingerprintV1(lv)).toBe(true);
    expect(lv?.qualityClassification).toBe('OBSERVED_FRESH');

    await cleanupOrg(organizationId);
  });

  it('Tesla software: HV observed, LV NEVER_OBSERVED quality', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      metadata: {
        connectionIdentity: {
          version: 'vo-source-link-connection-identity-v1',
          verifiedModality: 'SOFTWARE_INTEGRATION',
          telemetrySourceFamily: 'DIMO_SOFTWARE',
        },
      },
    });
    await prisma.vehicle.update({
      where: { id: fixture.vehicleId },
      data: { fuelType: 'ELECTRIC' },
    });
    const ts = new Date('2026-10-15T14:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      evSoc: 72,
      rawPayloadJson: {
        powertrainTractionBatteryStateOfChargeCurrent: { value: 72, timestamp: ts.toISOString() },
      },
    });
    const result = await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const lv = result?.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.qualityClassification).toBe('NEVER_OBSERVED');
    const hv = result?.signals.find((s) => s.canonicalSignalKey === 'hv_battery_soc');
    expect(hv?.empiricalObservation).toBe('OBSERVED');

    await cleanupOrg(organizationId);
  });

  it('accelerator listed but never observed stays NEVER_OBSERVED not NOT_LISTED', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    await prisma.vehicleDrivingCapability.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        hardwareProfile: 'LTE_R1',
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName: 'powertrainCombustionEngineAcceleratorPedalPosition',
        capabilityKey: 'powertrainCombustionEngineAcceleratorPedalPosition',
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        checkedAt: new Date(),
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      },
    });
    const result = await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const accel = result?.signals.find((s) => s.canonicalSignalKey === 'accelerator_pedal_position');
    expect(accel?.declaredSupport).toBe('LISTED');
    expect(accel?.qualityClassification).toBe('NEVER_OBSERVED');

    await cleanupOrg(organizationId);
  });

  it('bundle history loader returns latest 64 timestamps not oldest', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const base = new Date('2020-01-01T00:00:00.000Z');
    const timestamps = Array.from({ length: 80 }, (_, i) => new Date(base.getTime() + i * 60_000));
    await seedBundleHistory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      timestamps,
    });
    const loaded = await loadVsiBundleHistoricalEvidence(prisma as never, {
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      provider: 'DIMO',
    });
    expect(loaded.bundleSourceTimestamps).toHaveLength(64);
    expect(loaded.bundleSourceTimestamps[0]!.getTime()).toBe(base.getTime() + 16 * 60_000);
    expect(loaded.bundleSourceTimestamps[63]!.getTime()).toBe(base.getTime() + 79 * 60_000);

    await cleanupOrg(organizationId);
  });

  it('many bundle rows with one pedal observation keeps per-signal cadence null', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date('2026-10-15T16:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lv: 12.1,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.1, timestamp: ts.toISOString() },
        powertrainCombustionEngineAcceleratorPedalPosition: { value: 22, timestamp: ts.toISOString() },
      },
    });
    await seedBundleHistory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      timestamps: [
        new Date('2026-10-15T15:00:00.000Z'),
        new Date('2026-10-15T15:10:00.000Z'),
        new Date('2026-10-15T15:20:00.000Z'),
        ts,
      ],
    });
    const result = await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const pedal = result?.signals.find((s) => s.canonicalSignalKey === 'accelerator_pedal_position');
    const bundle = result?.signals.find((s) => s.canonicalSignalKey === 'provider_source_timestamp');
    expect(pedal?.observedSamples).toBeNull();
    expect(pedal?.limitations).toContain(VSI_LIMITATION_PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT);
    expect(bundle?.provenSourceAdvances).toBeGreaterThan(0);

    await cleanupOrg(organizationId);
  });

  it('GPS fresh with unchanged LV: position observed, LV empirical from composer', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const gpsTs = new Date('2026-10-15T17:00:00.000Z');
    const lvTs = new Date('2026-10-14T08:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: gpsTs,
      providerFetchedAt: gpsTs,
      lv: 12.0,
      rawPayloadJson: {
        currentLocationCoordinates: {
          value: { latitude: 48.1, longitude: 11.5 },
          timestamp: gpsTs.toISOString(),
        },
        lowVoltageBatteryCurrentVoltage: { value: 12.0, timestamp: lvTs.toISOString() },
      },
    });
    const result = await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const pos = result?.signals.find((s) => s.canonicalSignalKey === 'position_coordinates');
    const lv = result?.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(pos?.empiricalObservation).toBe('OBSERVED');
    expect(lv?.empiricalObservation).toBe('OBSERVED');
    expect(pos?.observedCadenceMedianSeconds).toBeNull();

    await cleanupOrg(organizationId);
  });

  it('idempotent rematerialize does not bump revision when fingerprint unchanged', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date('2026-10-15T15:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      rawPayloadJson: {},
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row.profileRevision).toBe(1);

    await cleanupOrg(organizationId);
  });
});
