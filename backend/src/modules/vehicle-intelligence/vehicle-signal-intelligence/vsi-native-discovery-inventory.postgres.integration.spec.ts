/**
 * VSI native discovery inventory — PostgreSQL integration (P1a).
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget, vsiSignalProfileCompoundWhere } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import {
  VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB,
  buildCanonicalEmptyNativeDiscoveryInventoryDbJson,
  isLegacyEmptyNativeDiscoveryInventoryRaw,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';
import {
  emptyNativeSignalDiscoveryInventory,
  VsiEvidenceAxisEvaluationState,
} from './vsi-native-signal-discovery-inventory.contract';
import { mapProfileRowToSummary } from './vsi-master-intelligence-read.mapper';
import {
  resolveNativeDiscoveryInventoryForConsumerContext,
  VsiNativeDiscoveryConsumerTemporalMode,
} from './vsi-native-signal-discovery-as-of.guard';
import { fingerprintVsiProfileSemanticFromPersisted } from './vsi-profile-fingerprint.util';

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
  aftermarketDevice: { id: 'R1-native-discovery-p1a' },
  syntheticDevice: null,
};

function inventoryWithNativeSignal(
  scope: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    providerIdentity: string;
  },
  nativeName: string,
  evaluatedAt: Date,
) {
  const base = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
  return {
    ...base,
    entries: [
      {
        providerNativeSignalName: nativeName,
        aliasVerdict: 'UNKNOWN_SIGNAL' as const,
        canonicalSignalKey: null,
        snapshot: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
          lastObservedAt: evaluatedAt.toISOString(),
          lastSourceTimestamp: evaluatedAt.toISOString(),
        },
        historical: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
          firstSeenAt: null,
          lastSeenAt: null,
          sampleMetadata: {
            windowStartAt: null,
            windowEndAt: null,
            pointCount: null,
            tripCountWithPoints: null,
            readCapApplied: null,
          },
        },
        ingestionLimitations: [],
      },
    ],
  };
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

(LIVE ? describe : describe.skip)(
  'VSI native discovery inventory (PostgreSQL P1a)',
  () => {
    const prisma = new PrismaClient();
    const declared = new VsiDeclaredCatalogResolver(prisma as never);
    const service = new VsiSignalProfileMaterializationService(
      prisma as never,
      declared,
      createNoopVsiProfileCadenceEvidenceLoader(),
    );

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('exposes canonical empty inventory default on new profiles', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);

      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'test-fp-empty',
          evaluatedAt: new Date('2026-11-02T10:00:00.000Z'),
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
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
      expect(isLegacyEmptyNativeDiscoveryInventoryRaw(row.nativeSignalDiscoveryInventory)).toBe(
        true,
      );
      expect(VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB.contractVersion).toBe(
        'vsi-native-signal-discovery-v1',
      );
      const normalized = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
      expect(normalized.entries).toHaveLength(0);
      expect(normalized.scope.organizationId).toBe(organizationId);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('keeps Master Admin summary compatible (signalsSnapshot-only)', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      const inv = inventoryWithNativeSignal(scope, 'obdEngineLoad', evaluatedAt);
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 2,
          contentFingerprint: 'test-fp-master',
          evaluatedAt,
          signalsSnapshot: [
            {
              canonicalSignalKey: 'lv_voltage',
              empiricalObservation: 'OBSERVED',
            },
          ],
          nativeSignalDiscoveryInventory: inv as object,
          profileLimitations: [],
        },
      });
      const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: {
          organizationId_vehicleId_providerSourceLinkId: vsiSignalProfileCompoundWhere(scope)
            .organizationId_vehicleId_providerSourceLinkId,
        },
      });
      const summary = mapProfileRowToSummary(row, 'DIMO');
      expect(summary.providerSourceLinkId).toBe(fixture.linkId);
      expect(summary.profileRevision).toBe(2);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('persists inventory without revision or fingerprint drift', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 4,
          contentFingerprint: 'semantic-fp-stable',
          evaluatedAt,
          lastMaterializedSourceTimestamp: evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });

      const before = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: vsiSignalProfileCompoundWhere(scope),
      });
      const fpBefore = fingerprintVsiProfileSemanticFromPersisted({
        profileContractVersion: before.profileContractVersion,
        providerSourceLinkId: before.providerSourceLinkId,
        providerIdentity: before.providerIdentity,
        verifiedModality: before.verifiedModality,
        telemetrySourceFamily: before.telemetrySourceFamily,
        declaredCatalogCheckedAt: before.declaredCatalogCheckedAt,
        lastMaterializedSourceTimestamp: before.lastMaterializedSourceTimestamp,
        lastProvenStrictSourceAdvanceAt: before.lastProvenStrictSourceAdvanceAt,
        profileLimitations: before.profileLimitations,
        signalsSnapshot: before.signalsSnapshot,
      });

      const next = inventoryWithNativeSignal(scope, 'powertrainCombustionEngineECT', evaluatedAt);
      const outcome = await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: next,
        latestStateProviderBindingId: fixture.linkId,
        latestStateSourceTimestampMs: evaluatedAt.getTime(),
      });
      expect(outcome).toBe('applied');

      const after = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: vsiSignalProfileCompoundWhere(scope),
      });
      expect(after.profileRevision).toBe(before.profileRevision);
      expect(after.contentFingerprint).toBe(before.contentFingerprint);
      const normalized = normalizeNativeSignalDiscoveryInventoryFromProfileRow(after);
      expect(normalized.entries.map((e) => e.providerNativeSignalName)).toContain(
        'powertrainCombustionEngineECT',
      );
      const fpAfter = fingerprintVsiProfileSemanticFromPersisted({
        profileContractVersion: after.profileContractVersion,
        providerSourceLinkId: after.providerSourceLinkId,
        providerIdentity: after.providerIdentity,
        verifiedModality: after.verifiedModality,
        telemetrySourceFamily: after.telemetrySourceFamily,
        declaredCatalogCheckedAt: after.declaredCatalogCheckedAt,
        lastMaterializedSourceTimestamp: after.lastMaterializedSourceTimestamp,
        lastProvenStrictSourceAdvanceAt: after.lastProvenStrictSourceAdvanceAt,
        profileLimitations: after.profileLimitations,
        signalsSnapshot: after.signalsSnapshot,
      });
      expect(fpAfter).toBe(fpBefore);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('rejects stale source-link binding', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'fp',
          evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });
      const next = inventoryWithNativeSignal(scope, 'speed', evaluatedAt);
      const outcome = await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: next,
        latestStateProviderBindingId: randomUUID(),
        latestStateSourceTimestampMs: evaluatedAt.getTime(),
      });
      expect(outcome).toBe('binding_mismatch');

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('rejects out-of-order source timestamps', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T12:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'fp',
          evaluatedAt,
          lastMaterializedSourceTimestamp: evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });
      const next = inventoryWithNativeSignal(scope, 'speed', new Date('2026-11-02T10:00:00.000Z'));
      const outcome = await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: next,
        latestStateProviderBindingId: fixture.linkId,
        latestStateSourceTimestampMs: new Date('2026-11-02T10:00:00.000Z').getTime(),
      });
      expect(outcome).toBe('out_of_order');

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('is idempotent on identical inventory payload', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      const next = inventoryWithNativeSignal(scope, 'RPM', evaluatedAt);
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'fp',
          evaluatedAt,
          lastMaterializedSourceTimestamp: evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory: next as object,
          profileLimitations: [],
        },
      });
      const first = await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: next,
        latestStateProviderBindingId: fixture.linkId,
        latestStateSourceTimestampMs: evaluatedAt.getTime(),
      });
      expect(first).toBe('noop');

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('merges concurrent inventory writers without losing native keys', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'fp',
          evaluatedAt,
          lastMaterializedSourceTimestamp: evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });

      const invA = inventoryWithNativeSignal(scope, 'signal_alpha', evaluatedAt);
      const invB = inventoryWithNativeSignal(scope, 'signal_beta', evaluatedAt);
      const [outA, outB] = await Promise.all([
        service.persistNativeDiscoveryInventoryOperationalRefresh({
          ...scope,
          nextInventory: invA,
          latestStateProviderBindingId: fixture.linkId,
          latestStateSourceTimestampMs: evaluatedAt.getTime() + 1,
        }),
        service.persistNativeDiscoveryInventoryOperationalRefresh({
          ...scope,
          nextInventory: invB,
          latestStateProviderBindingId: fixture.linkId,
          latestStateSourceTimestampMs: evaluatedAt.getTime() + 2,
        }),
      ]);
      expect([outA, outB].every((o) => o === 'applied' || o === 'noop' || o === 'conflict')).toBe(
        true,
      );

      const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: vsiSignalProfileCompoundWhere(scope),
      });
      const names = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row).entries.map(
        (e) => e.providerNativeSignalName,
      );
      expect(names).toEqual(expect.arrayContaining(['signal_alpha', 'signal_beta']));

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('enforces tenant isolation on inventory scope', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const otherOrg = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 1,
          contentFingerprint: 'fp',
          evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });
      const wrongScopeInv = inventoryWithNativeSignal(
        { ...scope, organizationId: otherOrg },
        'speed',
        evaluatedAt,
      );
      await expect(
        service.persistNativeDiscoveryInventoryOperationalRefresh({
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          nextInventory: wrongScopeInv,
          latestStateProviderBindingId: fixture.linkId,
          latestStateSourceTimestampMs: evaluatedAt.getTime(),
        }),
      ).rejects.toThrow(/organizationId mismatch/);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrg] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrg] } },
      });
    });

    it('excludes HEAD inventory from AS_OF consumer view', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-11-02T10:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      const headInv = inventoryWithNativeSignal(scope, 'RPM', evaluatedAt);
      const view = resolveNativeDiscoveryInventoryForConsumerContext({
        mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
        headInventory: headInv,
      });
      expect(view.inventory).toBeNull();
      const revisionCount = await prisma.vehicleSignalCapabilityProfileRevision.count({
        where: { organizationId, vehicleId: fixture.vehicleId },
      });
      expect(revisionCount).toBe(0);

      await prisma.organization.delete({ where: { id: organizationId } });
    });
  },
);
