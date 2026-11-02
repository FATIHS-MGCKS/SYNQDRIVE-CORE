/**
 * P1b snapshot discovery — materialization + PostgreSQL persistence.
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { normalizeNativeSignalDiscoveryInventoryFromProfileRow } from './vsi-native-discovery-inventory.db.util';
import { VsiEvidenceAxisEvaluationState } from './vsi-native-signal-discovery-evaluation-state';
import {
  resolveNativeDiscoveryInventoryForConsumerContext,
  VsiNativeDiscoveryConsumerTemporalMode,
} from './vsi-native-signal-discovery-as-of.guard';
import { fingerprintVsiProfileSemanticFromPersisted } from './vsi-profile-fingerprint.util';
import { isVsiDiscoverySnapshotInventoryEnabled } from './vsi-discovery-snapshot-inventory.config';
import { probeNativeDiscoveryInventoryColumnAvailable } from './vsi-native-discovery-inventory-schema.guard';
import { VsiEvidenceAxisNotEvaluatedReason } from './vsi-native-signal-discovery-evaluation-state';
import {
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';

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

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p1b-discovery' },
  syntheticDevice: null,
};

async function upsertVls(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
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
      null,
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

async function addSecondActiveDimoLink(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
  },
): Promise<string> {
  const dimoId = randomUUID();
  const externalId = `0x${randomUUID().replace(/-/g, '')}`;
  const raw = JSON.stringify(RUPTELA_RAW);
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (
      id, external_id, vin, make, model, year, fuel_type, connection_status, raw_json, token_id, created_at, updated_at
    )
    VALUES (
      ${dimoId}::text,
      ${externalId},
      NULL,
      'Make',
      'Model',
      2021,
      'GASOLINE',
      'CONNECTED'::"DimoConnectionStatus",
      ${raw}::jsonb,
      ${Math.floor(Math.random() * 1_000_000) + 4_000_000},
      NOW(),
      NOW()
    )
  `;
  const consentId = randomUUID();
  await prisma.vehicleProviderConsent.create({
    data: {
      id: consentId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'DIMO',
      grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
      status: VehicleProviderConsentStatus.ACTIVE,
      scopes: [],
    },
  });
  const linkId = randomUUID();
  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId: input.vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      sourceSubtype: 'DIMO_TELEMETRY_P1B_MULTI_LINK',
      dimoVehicleId: dimoId,
      consentId,
      isActive: true,
      metadata: {
        provenance: 'backfill',
        version: 1,
        dimoExternalId: externalId,
      },
    },
  });
  return linkId;
}

(LIVE ? describe : describe.skip)('VSI snapshot native discovery P1b (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const service = new VsiSignalProfileMaterializationService(
    prisma as never,
    declared,
    createNoopVsiProfileCadenceEvidenceLoader(),
  );
  let prevFlag: string | undefined;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    prevFlag = process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
  });

  afterAll(async () => {
    if (prevFlag === undefined) {
      delete process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
    } else {
      process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = prevFlag;
    }
    await prisma.$disconnect();
  });

  it('feature OFF leaves canonical empty inventory after materialize', async () => {
    delete process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
    expect(isVsiDiscoverySnapshotInventoryEnabled()).toBe(false);

    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
    const ts = new Date('2026-10-15T12:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01.000Z'),
      rawPayloadJson: {
        powertrainCombustionEngineECT: { value: 90, timestamp: ts.toISOString() },
        customUnknownSignal: { value: 1, timestamp: ts.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
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
    const normalized = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
    expect(normalized.entries).toHaveLength(0);

    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('feature ON discovers ECT and unknown natives without revision bump', async () => {
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
    const ts = new Date('2026-10-15T12:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01.000Z'),
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.6, timestamp: ts.toISOString() },
        powertrainCombustionEngineECT: { value: 88, timestamp: ts.toISOString() },
        obdCustomUnknownField: { value: 2, timestamp: ts.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
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
    const inv = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
    const names = inv.entries.map((e) => e.providerNativeSignalName);
    expect(names).toEqual(
      expect.arrayContaining([
        'powertrainCombustionEngineECT',
        'obdCustomUnknownField',
        'lowVoltageBatteryCurrentVoltage',
      ]),
    );
    const ect = inv.entries.find((e) => e.providerNativeSignalName === 'powertrainCombustionEngineECT');
    expect(ect?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
    expect(ect?.canonicalSignalKey).toBeNull();
    const fp = fingerprintVsiProfileSemanticFromPersisted({
      profileContractVersion: row.profileContractVersion,
      providerSourceLinkId: row.providerSourceLinkId,
      providerIdentity: row.providerIdentity,
      verifiedModality: row.verifiedModality,
      telemetrySourceFamily: row.telemetrySourceFamily,
      declaredCatalogCheckedAt: row.declaredCatalogCheckedAt,
      lastMaterializedSourceTimestamp: row.lastMaterializedSourceTimestamp,
      lastProvenStrictSourceAdvanceAt: row.lastProvenStrictSourceAdvanceAt,
      profileLimitations: row.profileLimitations,
      signalsSnapshot: row.signalsSnapshot,
    });
    expect(fp).toBeTruthy();
    expect(row.profileRevision).toBeGreaterThanOrEqual(1);
    const asOf = resolveNativeDiscoveryInventoryForConsumerContext({
      mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
      headInventory: inv,
    });
    expect(asOf.inventory).toBeNull();

    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('multi active links: unique binding observes on bound link only', async () => {
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const link2Id = await addSecondActiveDimoLink(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
    const ts = new Date('2026-10-15T12:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01.000Z'),
      rawPayloadJson: {
        powertrainCombustionEngineECT: { value: 91, timestamp: ts.toISOString() },
      },
    });

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: link2Id,
    });

    const boundRow = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    const otherRow = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: link2Id,
        },
      },
    });
    const boundInv = normalizeNativeSignalDiscoveryInventoryFromProfileRow(boundRow);
    const otherInv = normalizeNativeSignalDiscoveryInventoryFromProfileRow(otherRow);
    const boundEct = boundInv.entries.find(
      (e) => e.providerNativeSignalName === 'powertrainCombustionEngineECT',
    );
    expect(boundEct?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
    expect(otherInv.entries).toHaveLength(0);

    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('multi active links with null binding fail-closes snapshot axis', async () => {
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    await addSecondActiveDimoLink(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
    });
    await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
    const ts = new Date('2026-10-15T12:00:00.000Z');
    const id = randomUUID();
    const raw = JSON.stringify({
      powertrainCombustionEngineECT: { value: 91, timestamp: ts.toISOString() },
    });
    await prisma.$executeRaw`
      INSERT INTO vehicle_latest_states (
        id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
        provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
      ) VALUES (
        ${id}::uuid,
        ${fixture.vehicleId},
        true,
        null,
        null,
        ${ts},
        ${new Date('2026-10-15T12:00:01.000Z')},
        NULL,
        'DIMO',
        ${raw}::jsonb,
        ${new Date('2026-10-15T12:00:01.000Z')}
      )
      ON CONFLICT (vehicle_id) DO UPDATE SET
        source_timestamp = EXCLUDED.source_timestamp,
        provider_fetched_at = EXCLUDED.provider_fetched_at,
        provider_binding_id = EXCLUDED.provider_binding_id,
        raw_payload_json = EXCLUDED.raw_payload_json,
        updated_at = EXCLUDED.updated_at
    `;

    await service.materializeFromPersistedEvidence({
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
    const inv = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
    const ect = inv.entries.find(
      (e) => e.providerNativeSignalName === 'powertrainCombustionEngineECT',
    );
    expect(ect?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.NOT_EVALUATED);
    expect(ect?.snapshot.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS,
    );

    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('P1a column probe fails closed when column dropped', async () => {
    expect(await probeNativeDiscoveryInventoryColumnAvailable(prisma)).toBe(true);
    await prisma.$executeRaw`
      ALTER TABLE vehicle_signal_capability_profiles
      DROP COLUMN IF EXISTS native_signal_discovery_inventory
    `;
    expect(await probeNativeDiscoveryInventoryColumnAvailable(prisma)).toBe(false);
    await prisma.$executeRaw`
      ALTER TABLE vehicle_signal_capability_profiles
      ADD COLUMN IF NOT EXISTS native_signal_discovery_inventory JSONB NOT NULL
      DEFAULT '{"contractVersion":"vsi-native-signal-discovery-v1","entries":[],"profileLimitations":[]}'::jsonb
    `;
    expect(await probeNativeDiscoveryInventoryColumnAvailable(prisma)).toBe(true);
  });
});
