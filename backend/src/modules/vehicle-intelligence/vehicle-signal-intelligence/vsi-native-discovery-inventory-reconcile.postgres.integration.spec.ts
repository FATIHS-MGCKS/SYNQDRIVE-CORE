/**
 * VSI P3A — native discovery inventory reconciliation (disposable PostgreSQL).
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import {
  PrismaClient,
  DrivingCapabilityStatus,
  VsiProfileLifecycleOutboxStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import { VsiProfileLifecycleOutboxWorker } from './vsi-profile-lifecycle.worker';
import { resolveNativeDiscoveryInventorySweepOutboxAnchor } from './vsi-native-discovery-inventory-sweep-anchor.util';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { VehicleRegistryLifecycle } from '@prisma/client';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import {
  buildCanonicalEmptyNativeDiscoveryInventoryDbJson,
  isLegacyEmptyNativeDiscoveryInventoryRaw,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';
import { planNativeDiscoveryInventoryReconcileSweep } from './vsi-native-discovery-inventory-reconcile.planner';
import { buildNativeDiscoveryInventoryCoverageSnapshot } from './vsi-native-discovery-inventory-coverage.service';
import { fingerprintVsiProfileSemanticFromPersisted } from './vsi-profile-fingerprint.util';
import {
  resolveNativeDiscoveryInventoryForConsumerContext,
  VsiNativeDiscoveryConsumerTemporalMode,
} from './vsi-native-signal-discovery-as-of.guard';

const LIVE = (() => {
  if (process.env.VSI03_READONLY_COMPOSER_PG !== '1') {
    return false;
  }
  try {
    assertVsi03DisposablePostgresTarget();
    return true;
  } catch {
    return false;
  }
})();

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-p3a-reconcile' },
  syntheticDevice: null,
};

async function seedDrivingCapability(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  await prisma.vehicleDrivingCapability.create({
    data: {
      organizationId,
      vehicleId,
      hardwareProfile: 'LTE_R1',
      providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      signalName: 'lowVoltageBatteryCurrentVoltage',
      capabilityKey: 'lowVoltageBatteryCurrentVoltage',
      capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      checkedAt: new Date(),
      capabilityVersion: 'test',
      metadata: { listedInAvailableSignals: true },
    },
  });
}

async function upsertVls(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
    rawPayloadJson: object;
  },
): Promise<void> {
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
      13.2,
      null,
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

async function seedProfileWithEmptyInventory(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    linkId: string;
    fingerprint: string;
  },
) {
  await prisma.vehicleSignalCapabilityProfile.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.linkId,
      providerIdentity: 'DIMO',
      profileContractVersion: 'vsi-signal-profile-v2',
      profileRevision: 3,
      contentFingerprint: input.fingerprint,
      evaluatedAt: new Date('2026-11-02T10:00:00.000Z'),
      lastMaterializedSourceTimestamp: new Date('2026-11-02T09:00:00.000Z'),
      signalsSnapshot: [
        {
          canonicalSignalKey: 'lv_voltage',
          empiricalObservation: 'OBSERVED',
        },
      ],
      nativeSignalDiscoveryInventory: buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
      profileLimitations: [],
    },
  });
}

(LIVE ? describe : describe.skip)('VSI P3A native discovery inventory reconcile (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(
    prisma as never,
    declared,
    createNoopVsiProfileCadenceEvidenceLoader(),
  );
  const outboxRepo = new VsiProfileLifecycleOutboxRepository(prisma as never);
  const enqueue = new VsiProfileLifecycleEnqueueService(outboxRepo);
  const processor = new VsiProfileLifecycleOutboxProcessor(
    prisma as never,
    outboxRepo,
    materialization,
    enqueue,
  );

  const prevReconcile = process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED;
  const prevSnapshot = process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
  const prevHf = process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  beforeEach(() => {
    process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED = 'true';
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    delete process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED;
  });

  afterEach(() => {
    if (prevReconcile == null) delete process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED;
    else process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED = prevReconcile;
    if (prevSnapshot == null) delete process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
    else process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = prevSnapshot;
    if (prevHf == null) delete process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED;
    else process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED = prevHf;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupOrg(organizationId: string) {
    await prisma.vsiProfileLifecycleOutbox.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.vehicleDrivingCapability.deleteMany({ where: { organizationId } });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicle: { organizationId } } });
    await prisma.vehicle.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  }

  it('plans sweep candidates with org-fair pagination cursor', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const fixtureA = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    const fixtureB = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedDrivingCapability(prisma, orgA, fixtureA.vehicleId);
    await seedDrivingCapability(prisma, orgB, fixtureB.vehicleId);
    await seedProfileWithEmptyInventory(prisma, {
      organizationId: orgA,
      vehicleId: fixtureA.vehicleId,
      linkId: fixtureA.linkId,
      fingerprint: 'fp-a',
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId: orgB,
      vehicleId: fixtureB.vehicleId,
      linkId: fixtureB.linkId,
      fingerprint: 'fp-b',
    });

    const first = await planNativeDiscoveryInventoryReconcileSweep({
      prisma,
      maxLinks: 1,
    });
    expect(first.candidates).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();

    const second = await planNativeDiscoveryInventoryReconcileSweep({
      prisma,
      cursor: first.nextCursor,
      maxLinks: 10,
    });
    expect(second.candidates.length).toBeGreaterThanOrEqual(1);

    await cleanupOrg(orgA);
    await cleanupOrg(orgB);
  });

  it('deduplicates concurrent reconcile outbox enqueue by idempotency key', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint: 'fp-dedupe',
    });
    const updatedAt = new Date('2026-11-02T10:00:00.000Z');
    await prisma.vehicleSignalCapabilityProfile.update({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
      data: { updatedAt },
    });

    const occurredAt = new Date();
    await enqueue.enqueueNativeDiscoveryInventoryReconcile({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      profileUpdatedAt: updatedAt,
      occurredAt,
    });
    await enqueue.enqueueNativeDiscoveryInventoryReconcile({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      profileUpdatedAt: updatedAt,
      occurredAt,
    });

    const rows = await prisma.vsiProfileLifecycleOutbox.findMany({
      where: {
        organizationId,
        eventType: 'NATIVE_DISCOVERY_INVENTORY_RECONCILE',
      },
    });
    expect(rows).toHaveLength(1);

    await cleanupOrg(organizationId);
  });

  it('reconcile refreshes inventory without semantic fingerprint or revision change', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
    const fingerprint = 'semantic-fp-stable';
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint,
    });
    const ts = new Date('2026-11-02T11:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-11-02T11:00:01.000Z'),
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 13.2, timestamp: ts.toISOString() },
        speed: { value: 12, timestamp: ts.toISOString() },
      },
    });

    const before = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    const semanticBefore = fingerprintVsiProfileSemanticFromPersisted(before);

    const outcome = await materialization.reconcileNativeDiscoveryInventoryForActiveLink({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(outcome === 'refreshed' || outcome === 'noop').toBe(true);

    const after = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(after.profileRevision).toBe(before.profileRevision);
    expect(after.contentFingerprint).toBe(fingerprint);
    expect(fingerprintVsiProfileSemanticFromPersisted(after)).toBe(semanticBefore);
    expect(isLegacyEmptyNativeDiscoveryInventoryRaw(after.nativeSignalDiscoveryInventory)).toBe(
      false,
    );

    const asOfView = resolveNativeDiscoveryInventoryForConsumerContext({
      mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
      headInventory: normalizeNativeSignalDiscoveryInventoryFromProfileRow(after),
    });
    expect(asOfView.inventory).toBeNull();
    expect(asOfView.limitations.length).toBeGreaterThan(0);

    await cleanupOrg(organizationId);
  });

  it('skips reconcile writes when master reconcile flag is OFF', async () => {
    process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED = 'false';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint: 'fp-off',
    });

    const outcome = await materialization.reconcileNativeDiscoveryInventoryForActiveLink({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(outcome).toBe('skipped');

    await cleanupOrg(organizationId);
  });

  it('skips reconcile for inactive superseded source links', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint: 'fp-inactive',
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    await enqueue.enqueueNativeDiscoveryInventoryReconcile({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      profileUpdatedAt: new Date(),
      occurredAt: new Date(),
    });
    await processor.processPendingBatch(5);

    const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(isLegacyEmptyNativeDiscoveryInventoryRaw(row.nativeSignalDiscoveryInventory)).toBe(true);

    await cleanupOrg(organizationId);
  });

  it('reclaims stale PROCESSING lease and completes reconcile outbox row', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint: 'fp-lease',
    });

    const row = await prisma.vsiProfileLifecycleOutbox.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        eventType: 'NATIVE_DISCOVERY_INVENTORY_RECONCILE',
        idempotencyKey: `lease-test:${randomUUID()}`,
        payload: { version: 1, providerSourceLinkId: fixture.linkId },
        occurredAt: new Date(),
        status: VsiProfileLifecycleOutboxStatus.PROCESSING,
        claimToken: randomUUID(),
        claimExpiresAt: new Date(Date.now() - 60_000),
        attempts: 1,
      },
    });

    await processor.processPendingBatch(5);
    const updated = await prisma.vsiProfileLifecycleOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.status).toBe(VsiProfileLifecycleOutboxStatus.COMPLETED);

    await cleanupOrg(organizationId);
  });

  it('exposes bounded read-only coverage metrics snapshot', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      fingerprint: 'fp-metrics',
    });

    const snapshot = await buildNativeDiscoveryInventoryCoverageSnapshot(prisma, {
      maxProfiles: 50,
    });
    expect(snapshot.contractVersion).toBe('vsi-native-discovery-inventory-coverage-v1');
    expect(snapshot.reconcileFeatureEnabled).toBe(true);
    expect(snapshot.inventoryMissing).toBeGreaterThanOrEqual(1);

    await cleanupOrg(organizationId);
  });

  it('resolves sweep outbox anchor from first ACTIVE vehicle fleet-wide (skips empty/inactive-only orgs)', async () => {
    const orgEmpty = await createLegacyReconcileOrg(prisma);
    const orgInactive = await createLegacyReconcileOrg(prisma);
    const orgActive = await createLegacyReconcileOrg(prisma);

    await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgInactive,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
      registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      linkActive: true,
    });

    const activeFixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgActive,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });

    const anchor = await resolveNativeDiscoveryInventorySweepOutboxAnchor(prisma);
    expect(anchor).not.toBeNull();
    expect(anchor!.organizationId).toBe(orgActive);
    expect(anchor!.vehicleId).toBe(activeFixture.vehicleId);
    expect(anchor!.organizationId).not.toBe(orgEmpty);

    await cleanupOrg(orgEmpty);
    await cleanupOrg(orgInactive);
    await cleanupOrg(orgActive);
  });

  it('sweep continuation crosses org boundaries with idempotent tick and restart on new bucket', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const fixtureA = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    const fixtureB = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId: orgA,
      vehicleId: fixtureA.vehicleId,
      linkId: fixtureA.linkId,
      fingerprint: 'fp-sweep-a',
    });
    await seedProfileWithEmptyInventory(prisma, {
      organizationId: orgB,
      vehicleId: fixtureB.vehicleId,
      linkId: fixtureB.linkId,
      fingerprint: 'fp-sweep-b',
    });

    const firstPlan = await planNativeDiscoveryInventoryReconcileSweep({
      prisma,
      maxLinks: 1,
    });
    expect(firstPlan.candidates).toHaveLength(1);
    expect(firstPlan.nextCursor).toBeTruthy();

    const anchor = await resolveNativeDiscoveryInventorySweepOutboxAnchor(prisma);
    expect(anchor).not.toBeNull();

    const tickBucket = 424242;
    await enqueue.enqueueNativeDiscoveryInventorySweepTick({
      organizationId: anchor!.organizationId,
      vehicleId: anchor!.vehicleId,
      occurredAt: new Date(),
      tickBucket,
    });
    await enqueue.enqueueNativeDiscoveryInventorySweepTick({
      organizationId: anchor!.organizationId,
      vehicleId: anchor!.vehicleId,
      occurredAt: new Date(),
      tickBucket,
    });
    expect(
      await prisma.vsiProfileLifecycleOutbox.count({
        where: { idempotencyKey: `vsi-p3a:INVENTORY_SWEEP_TICK:${tickBucket}` },
      }),
    ).toBe(1);

    await enqueue.enqueueNativeDiscoveryInventorySweepContinuation({
      organizationId: anchor!.organizationId,
      vehicleId: anchor!.vehicleId,
      cursor: firstPlan.nextCursor!,
      occurredAt: new Date(),
    });
    await enqueue.enqueueNativeDiscoveryInventorySweepContinuation({
      organizationId: anchor!.organizationId,
      vehicleId: anchor!.vehicleId,
      cursor: firstPlan.nextCursor!,
      occurredAt: new Date(),
    });
    const continuationKey = `vsi-p3a:INVENTORY_SWEEP:${firstPlan.nextCursor!.organizationId}:${firstPlan.nextCursor!.providerSourceLinkId}`;
    expect(
      await prisma.vsiProfileLifecycleOutbox.count({
        where: { idempotencyKey: continuationKey },
      }),
    ).toBe(1);

    await processor.processPendingBatch(25);

    const reconcileRows = await prisma.vsiProfileLifecycleOutbox.findMany({
      where: { eventType: 'NATIVE_DISCOVERY_INVENTORY_RECONCILE' },
    });
    const orgsTouched = new Set(reconcileRows.map((r) => r.organizationId));
    expect(orgsTouched.has(orgA)).toBe(true);
    expect(orgsTouched.has(orgB)).toBe(true);

    const restartBucket = tickBucket + 1;
    await enqueue.enqueueNativeDiscoveryInventorySweepTick({
      organizationId: anchor!.organizationId,
      vehicleId: anchor!.vehicleId,
      occurredAt: new Date(),
      tickBucket: restartBucket,
    });
    expect(
      await prisma.vsiProfileLifecycleOutbox.count({
        where: { idempotencyKey: `vsi-p3a:INVENTORY_SWEEP_TICK:${restartBucket}` },
      }),
    ).toBe(1);

    await cleanupOrg(orgA);
    await cleanupOrg(orgB);
  });

  it('feature OFF creates no sweep events and leaves lifecycle outbox usable', async () => {
    process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED = 'false';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

    const leaderGuard = { shouldRun: () => true } as never;
    const worker = new VsiProfileLifecycleOutboxWorker(
      processor,
      leaderGuard,
      enqueue,
      prisma as never,
    );
    RuntimeStatusRegistry.setWorkersEnabled(true);
    await worker.runInventorySweepSchedulerTick();

    const sweepCount = await prisma.vsiProfileLifecycleOutbox.count({
      where: { eventType: 'NATIVE_DISCOVERY_INVENTORY_SWEEP' },
    });
    expect(sweepCount).toBe(0);

    await enqueue.enqueueSourceLinkActivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: new Date(),
    });
    await processor.processPendingBatch(5);
    const activatedRows = await prisma.vsiProfileLifecycleOutbox.findMany({
      where: { organizationId, eventType: 'SOURCE_LINK_ACTIVATED' },
    });
    expect(activatedRows.some((r) => r.status === VsiProfileLifecycleOutboxStatus.COMPLETED)).toBe(
      true,
    );

    await cleanupOrg(organizationId);
    process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED = 'true';
  });
});
