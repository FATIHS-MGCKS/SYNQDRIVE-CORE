/**
 * Active RPM profile operational evidence refresh (disposable PostgreSQL).
 */
import { createScriptedVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  areVsiProfileSemanticEvaluationsEquivalent,
  fingerprintVsiProfileSemanticEvaluation,
} from './vsi-profile-fingerprint.util';
import type { VsiRpmCadenceEvidenceInput, VsiRpmCadenceTripWindow } from './vsi-profile-cadence.types';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-rpm-op-refresh' },
  syntheticDevice: null,
};

function buildFastTrips(count: number): VsiRpmCadenceTripWindow[] {
  const base = Date.parse('2026-10-27T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => ({
    tripId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    startMs: base + i * 7_200_000,
    endMs: base + i * 7_200_000 + 400_000,
  }));
}

function rpmEvidenceForTrips(trips: VsiRpmCadenceTripWindow[]): VsiRpmCadenceEvidenceInput {
  const points: { recordedAtMs: number; value: number }[] = [];
  for (const trip of trips) {
    for (let i = 0; i < 50; i += 1) {
      points.push({ recordedAtMs: trip.startMs + i * 1000, value: 1800 });
    }
  }
  return {
    iceRpmApplicability: 'APPLICABLE',
    tripWindows: trips,
    points,
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    hfReadStatus: 'SUCCESS',
  };
}

async function upsertVlsForTest(
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
      12.5,
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

(LIVE ? describe : describe.skip)(
  'VSI active RPM profile operational refresh (PostgreSQL)',
  () => {
    const prisma = new PrismaClient();
    const declared = new VsiDeclaredCatalogResolver(prisma as never);
    let rollingTripCount = 5;

    const cadenceService = new VsiSignalProfileMaterializationService(
      prisma as never,
      declared,
      createScriptedVsiProfileCadenceEvidenceLoader({
        loadRpmEvidence: async (ctx) =>
          ctx.refreshRpmCadence
            ? rpmEvidenceForTrips(buildFastTrips(rollingTripCount))
            : null,
        loadLvEvidence: async () => null,
      }),
    );

    beforeAll(() => {
      assertVsi03DisposablePostgresTarget();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('refreshes stored activeRpmProfile trip evidence without profileRevision bump', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
        metadata: {
          connectionIdentity: {
            version: 'vo-source-link-connection-identity-v1',
            verifiedModality: 'HARDWARE_DEVICE',
            telemetrySourceFamily: 'RUPTELA_R1',
          },
        },
      });

      await prisma.vehicle.update({
        where: { id: fixture.vehicleId },
        data: { fuelType: 'GASOLINE' },
      });

      await prisma.vehicleDrivingCapability.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          hardwareProfile: 'LTE_R1',
          providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
          signalName: 'powertrainCombustionEngineSpeed',
          capabilityKey: 'powertrainCombustionEngineSpeed',
          capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          checkedAt: new Date(),
          capabilityVersion: 'test',
          metadata: { listedInAvailableSignals: true },
        },
      });

      const sourceTs = new Date('2026-10-27T08:00:00.000Z');
      const providerFetchedAt = new Date('2026-10-27T08:00:01.000Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt,
        rawPayloadJson: {
          powertrainCombustionEngineSpeed: { value: 1800, timestamp: sourceTs.toISOString() },
        },
      });

      await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });

      rollingTripCount = 5;
      const first = await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
        rpmCadenceTripId: buildFastTrips(5)[4]!.tripId,
      });
      expect(first).not.toBeNull();

      const rowAfterFive = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(rowAfterFive?.profileRevision).toBeGreaterThanOrEqual(2);
      const revisionAfterFive = rowAfterFive!.profileRevision;
      const fpAfterFive = rowAfterFive!.contentFingerprint;

      const rpmFive = (
        rowAfterFive!.signalsSnapshot as {
          canonicalSignalKey: string;
          cadenceIntelligence?: {
            cadenceSemanticFingerprint?: string;
            activeRpmProfile?: {
              activeProfile: string;
              profileSemanticFingerprint: string;
              evaluatedTripIds: string[];
            };
            rpmCadenceTierResolution?: {
              contractVersion: string;
              tripClassifications: unknown[];
            };
          };
        }[]
      ).find((s) => s.canonicalSignalKey === 'engine_rpm');
      expect(rpmFive?.cadenceIntelligence?.activeRpmProfile?.activeProfile).toBe('RPM_1HZ');
      const tripIdsFive = rpmFive?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds ?? [];
      expect(tripIdsFive).toHaveLength(5);
      expect(rpmFive?.cadenceIntelligence?.rpmCadenceTierResolution?.contractVersion).toBe(
        'vsi-rpm-cadence-tier-resolution-v1',
      );
      expect(
        rpmFive?.cadenceIntelligence?.rpmCadenceTierResolution?.tripClassifications.length,
      ).toBeGreaterThan(0);

      rollingTripCount = 6;
      const second = await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
        rpmCadenceTripId: buildFastTrips(6)[5]!.tripId,
      });
      expect(second).not.toBeNull();
      expect(areVsiProfileSemanticEvaluationsEquivalent(rowAfterFive!, second!)).toBe(true);
      expect(fingerprintVsiProfileSemanticEvaluation(second!)).toBe(fpAfterFive);

      const rowAfterSix = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(rowAfterSix?.profileRevision).toBe(revisionAfterFive);
      expect(rowAfterSix?.contentFingerprint).toBe(fpAfterFive);

      const rpmSix = (
        rowAfterSix!.signalsSnapshot as {
          canonicalSignalKey: string;
          cadenceIntelligence?: {
            activeRpmProfile?: {
              profileSemanticFingerprint: string;
              evaluatedTripIds: string[];
              tripClassifications: unknown[];
            };
            rpmCadenceTierResolution?: { evaluatedTripIds: string[] };
          };
        }[]
      ).find((s) => s.canonicalSignalKey === 'engine_rpm');
      expect(rpmSix?.cadenceIntelligence?.activeRpmProfile?.profileSemanticFingerprint).toBe(
        rpmFive?.cadenceIntelligence?.activeRpmProfile?.profileSemanticFingerprint,
      );
      const tripIdsSix = rpmSix?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds ?? [];
      expect(tripIdsSix).toHaveLength(5);
      expect(tripIdsSix).not.toEqual(tripIdsFive);
      expect(tripIdsSix).toEqual(buildFastTrips(6).slice(-5).map((t) => t.tripId));
      expect((rpmSix?.cadenceIntelligence?.activeRpmProfile?.tripClassifications ?? []).length).toBe(
        5,
      );
      expect(rpmSix?.cadenceIntelligence?.rpmCadenceTierResolution?.evaluatedTripIds).toEqual(
        tripIdsSix,
      );

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    });

    it('rejects stale RPM rolling evidence (trips 1–5) after newer trips 2–6 persisted', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW_JSON,
        metadata: {
          connectionIdentity: {
            version: 'vo-source-link-connection-identity-v1',
            verifiedModality: 'HARDWARE_DEVICE',
            telemetrySourceFamily: 'RUPTELA_R1',
          },
        },
      });

      await prisma.vehicle.update({
        where: { id: fixture.vehicleId },
        data: { fuelType: 'GASOLINE' },
      });

      await prisma.vehicleDrivingCapability.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          hardwareProfile: 'LTE_R1',
          providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
          signalName: 'powertrainCombustionEngineSpeed',
          capabilityKey: 'powertrainCombustionEngineSpeed',
          capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          checkedAt: new Date(),
          capabilityVersion: 'test',
          metadata: { listedInAvailableSignals: true },
        },
      });

      const sourceTs = new Date('2026-10-27T09:00:00.000Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: sourceTs,
        providerFetchedAt: new Date('2026-10-27T09:00:01.000Z'),
        rawPayloadJson: {
          powertrainCombustionEngineSpeed: { value: 1800, timestamp: sourceTs.toISOString() },
        },
      });

      await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      });

      rollingTripCount = 6;
      await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
        rpmCadenceTripId: buildFastTrips(6)[5]!.tripId,
      });

      const rowNewer = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      const rpmNewer = (
        rowNewer!.signalsSnapshot as {
          canonicalSignalKey: string;
          cadenceIntelligence?: { activeRpmProfile?: { evaluatedTripIds: string[] } };
        }[]
      ).find((s) => s.canonicalSignalKey === 'engine_rpm');
      const idsNewer = rpmNewer?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds ?? [];
      expect(idsNewer).toEqual(buildFastTrips(6).slice(-5).map((t) => t.tripId));
      const revision = rowNewer!.profileRevision;

      rollingTripCount = 5;
      await cadenceService.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
        rpmCadenceTripId: buildFastTrips(5)[4]!.tripId,
      });

      const rowAfterStale = await prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId,
            vehicleId: fixture.vehicleId,
            providerSourceLinkId: fixture.linkId,
          },
        },
      });
      expect(rowAfterStale?.profileRevision).toBe(revision);
      const rpmStale = (
        rowAfterStale!.signalsSnapshot as {
          canonicalSignalKey: string;
          cadenceIntelligence?: { activeRpmProfile?: { evaluatedTripIds: string[] } };
        }[]
      ).find((s) => s.canonicalSignalKey === 'engine_rpm');
      expect(rpmStale?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds).toEqual(idsNewer);

      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    });
  },
);
