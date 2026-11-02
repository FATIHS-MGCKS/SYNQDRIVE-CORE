/**
 * VSI P2 HF native discovery — PostgreSQL integration (VSI03 disposable target).
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import { PrismaClient, DrivingCapabilityStatus, TripStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { assertVsi03DisposablePostgresTarget, vsiSignalProfileCompoundWhere } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import {
  buildCanonicalEmptyNativeDiscoveryInventoryDbJson,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';
import {
  emptyNativeSignalDiscoveryInventory,
  VsiEvidenceAxisEvaluationState,
} from './vsi-native-signal-discovery-inventory.contract';
import {
  resolveNativeDiscoveryInventoryForConsumerContext,
  VsiNativeDiscoveryConsumerTemporalMode,
} from './vsi-native-signal-discovery-as-of.guard';
import { fingerprintVsiProfileSemanticFromPersisted } from './vsi-profile-fingerprint.util';
import { buildHfNativeDiscoveryInventoryUpdate } from './vsi-hf-native-discovery.loader';
import { buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis } from './vsi-hf-native-discovery.entry-builders';
import { VSI_VERIFIED_PRODUCTION_CH_NATIVE_SIGNAL_NAMES } from './vsi-verified-production-ch-signals.fixture';

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
  aftermarketDevice: { id: 'R1-native-discovery-p2-hf' },
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

async function seedCompletedTrip(
  prisma: PrismaClient,
  vehicleId: string,
  tripId: string,
  start: Date,
  end: Date,
): Promise<void> {
  await prisma.vehicleTrip.create({
    data: {
      id: tripId,
      vehicleId,
      startTime: start,
      endTime: end,
      tripStatus: TripStatus.COMPLETED,
    },
  });
}

function mockClickHouseForVerifiedSignals(): ClickHouseHfService {
  return {
    getVsiDiscoveryTripHfSignalAggregates: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      signals: VSI_VERIFIED_PRODUCTION_CH_NATIVE_SIGNAL_NAMES.map((name, i) => ({
        signalName: name,
        pointCount: 5 + i,
        firstSeenAtIso: '2026-10-27T10:00:01.000Z',
        lastSeenAtIso: '2026-10-27T10:59:00.000Z',
      })),
      tenantScopeViolation: false,
    }),
  } as unknown as ClickHouseHfService;
}

(LIVE ? describe : describe.skip)(
  'VSI HF native discovery inventory (PostgreSQL P2)',
  () => {
    const prisma = new PrismaClient();
    const declared = new VsiDeclaredCatalogResolver(prisma as never);

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('persists HF historical evidence through operational CAS without fingerprint drift', async () => {
      const clickHouseHf = mockClickHouseForVerifiedSignals();
      const service = new VsiSignalProfileMaterializationService(
        prisma as never,
        declared,
        createNoopVsiProfileCadenceEvidenceLoader(),
        clickHouseHf,
      );

      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      await seedDrivingCapability(prisma, organizationId, fixture.vehicleId);
      const evaluatedAt = new Date('2026-10-28T00:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };

      await seedCompletedTrip(
        prisma,
        fixture.vehicleId,
        randomUUID(),
        new Date('2026-10-27T10:00:00.000Z'),
        new Date('2026-10-27T11:00:00.000Z'),
      );

      await prisma.vehicleDataSourceLink.update({
        where: { id: fixture.linkId },
        data: { activatedAt: new Date('2026-01-01T00:00:00.000Z') },
      });

      await prisma.vehicleSignalCapabilityProfile.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
          providerIdentity: 'DIMO',
          profileContractVersion: 'vsi-signal-profile-v2',
          profileRevision: 3,
          contentFingerprint: 'semantic-fp-p2-hf',
          evaluatedAt,
          lastMaterializedSourceTimestamp: evaluatedAt,
          signalsSnapshot: [],
          nativeSignalDiscoveryInventory:
            buildCanonicalEmptyNativeDiscoveryInventoryDbJson() as object,
          profileLimitations: [],
        },
      });

      const linkRow = await prisma.vehicleDataSourceLink.findFirstOrThrow({
        where: { id: fixture.linkId },
      });

      const hfInventory = await buildHfNativeDiscoveryInventoryUpdate(prisma, {
        ...scope,
        projectionAsOf: evaluatedAt,
        linkActivatedAt: new Date('2026-01-01T00:00:00.000Z'),
        linkDeactivatedAt: linkRow.deactivatedAt,
        clickHouseHf,
      });
      expect(hfInventory.entries.length).toBeGreaterThan(0);

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

      const outcome = await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: hfInventory,
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
      expect(
        normalized.entries.some(
          (e) =>
            e.providerNativeSignalName === 'speed' &&
            e.historical.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
        ),
      ).toBe(true);

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

      await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicleId } });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('preserves snapshot axis when merging HF update with P1b snapshot placeholder', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-10-28T00:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      const snapshotObserved = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
      snapshotObserved.entries = [
        {
          providerNativeSignalName: 'obdEngineLoad',
          aliasVerdict: 'UNKNOWN_SIGNAL',
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
      ];

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
          nativeSignalDiscoveryInventory: snapshotObserved as object,
          profileLimitations: [],
        },
      });

      const service = new VsiSignalProfileMaterializationService(
        prisma as never,
        declared,
        createNoopVsiProfileCadenceEvidenceLoader(),
      );

      const hfOnlySpeed = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
      hfOnlySpeed.entries = [
        {
          providerNativeSignalName: 'speed',
          aliasVerdict: 'EXPLICIT_PRIMARY_ALIAS',
          canonicalSignalKey: 'vehicle_speed',
          snapshot: buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis(),
          historical: {
            evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
            firstSeenAt: '2026-10-27T10:00:01.000Z',
            lastSeenAt: '2026-10-27T10:59:00.000Z',
            sampleMetadata: {
              windowStartAt: '2026-10-14T00:00:00.000Z',
              windowEndAt: evaluatedAt.toISOString(),
              pointCount: 100,
              tripCountWithPoints: 1,
              readCapApplied: 12000,
            },
          },
          ingestionLimitations: [],
        },
      ];

      await service.persistNativeDiscoveryInventoryOperationalRefresh({
        ...scope,
        nextInventory: hfOnlySpeed,
        latestStateProviderBindingId: fixture.linkId,
        latestStateSourceTimestampMs: evaluatedAt.getTime() + 1,
      });

      const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: vsiSignalProfileCompoundWhere(scope),
      });
      const normalized = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
      const load = normalized.entries.find((e) => e.providerNativeSignalName === 'obdEngineLoad');
      expect(load?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
      expect(normalized.entries.map((e) => e.providerNativeSignalName).sort()).toEqual([
        'obdEngineLoad',
        'speed',
      ]);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('merges concurrent snapshot and HF writers without losing keys', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-10-28T00:00:00.000Z');
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

      const service = new VsiSignalProfileMaterializationService(
        prisma as never,
        declared,
        createNoopVsiProfileCadenceEvidenceLoader(),
      );

      const snapshotInv = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
      snapshotInv.entries = [
        {
          providerNativeSignalName: 'obdThrottlePosition',
          aliasVerdict: 'UNKNOWN_SIGNAL',
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
      ];

      const hfInv = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
      hfInv.entries = [
        {
          providerNativeSignalName: 'powertrainCombustionEngineSpeed',
          aliasVerdict: 'EXPLICIT_PRIMARY_ALIAS',
          canonicalSignalKey: 'engine_rpm',
          snapshot: buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis(),
          historical: {
            evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
            firstSeenAt: '2026-10-27T10:00:01.000Z',
            lastSeenAt: '2026-10-27T10:59:00.000Z',
            sampleMetadata: {
              windowStartAt: '2026-10-14T00:00:00.000Z',
              windowEndAt: evaluatedAt.toISOString(),
              pointCount: 50,
              tripCountWithPoints: 1,
              readCapApplied: 12000,
            },
          },
          ingestionLimitations: [],
        },
      ];

      await Promise.all([
        service.persistNativeDiscoveryInventoryOperationalRefresh({
          ...scope,
          nextInventory: snapshotInv,
          latestStateProviderBindingId: fixture.linkId,
          latestStateSourceTimestampMs: evaluatedAt.getTime() + 1,
        }),
        service.persistNativeDiscoveryInventoryOperationalRefresh({
          ...scope,
          nextInventory: hfInv,
          latestStateProviderBindingId: fixture.linkId,
          latestStateSourceTimestampMs: evaluatedAt.getTime() + 2,
        }),
      ]);

      const row = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
        where: vsiSignalProfileCompoundWhere(scope),
      });
      const names = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row).entries.map(
        (e) => e.providerNativeSignalName,
      );
      expect(names).toEqual(
        expect.arrayContaining(['obdThrottlePosition', 'powertrainCombustionEngineSpeed']),
      );

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    });

    it('excludes operational inventory from APDS AS_OF consumer view', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
      });
      const evaluatedAt = new Date('2026-10-28T00:00:00.000Z');
      const scope = {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
      };
      const headInv = emptyNativeSignalDiscoveryInventory(scope, evaluatedAt);
      headInv.entries = [
        {
          providerNativeSignalName: 'speed',
          aliasVerdict: 'UNKNOWN_SIGNAL',
          canonicalSignalKey: null,
          snapshot: buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis(),
          historical: {
            evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
            firstSeenAt: evaluatedAt.toISOString(),
            lastSeenAt: evaluatedAt.toISOString(),
            sampleMetadata: {
              windowStartAt: evaluatedAt.toISOString(),
              windowEndAt: evaluatedAt.toISOString(),
              pointCount: 1,
              tripCountWithPoints: 1,
              readCapApplied: 12000,
            },
          },
          ingestionLimitations: [],
        },
      ];
      const view = resolveNativeDiscoveryInventoryForConsumerContext({
        mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
        headInventory: headInv,
      });
      expect(view.inventory).toBeNull();

      await prisma.organization.delete({ where: { id: organizationId } });
    });
  },
);
