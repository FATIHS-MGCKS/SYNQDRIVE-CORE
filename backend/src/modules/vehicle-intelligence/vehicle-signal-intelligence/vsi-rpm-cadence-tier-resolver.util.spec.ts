import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  classifySingleTripRpmProfile,
} from './vsi-active-rpm-profile-resolver.util';
import {
  classifySingleTripRpmCadenceTier,
  mergeRpmCadenceTierResolutionOntoEngineRpmCadence,
  resolveRpmCadenceTierResolutionV1,
} from './vsi-rpm-cadence-tier-resolver.util';
import { classifyVsiRpmCadenceTierV1 } from './vsi-rpm-cadence-tier.util';
import { analyzeEngineRpmCadence } from './vsi-profile-cadence-stats.util';
import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import type { RpmCadenceTierFrozenTripFixture } from './vsi-rpm-cadence-tier-frozen-digest.util';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';

const fixturePath = join(
  __dirname,
  'fixtures/rpm-multicadence-tier-frozen-cohort-v1.json',
);

describe('vsi-rpm-cadence-tier-resolver', () => {
  const cohort = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    fleets: {
      tiguan: { trips: RpmCadenceTierFrozenTripFixture[] };
    };
  };

  it('aligns per-trip tier with pure classifier on frozen Tiguan sentinel c8c321a8', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
    const row = classifySingleTripRpmCadenceTier({
      trip: evidence.tripWindows[0]!,
      points: evidence.points,
    });
    expect(row.tier).toBe(trip.fableExpectedTier);
    expect(row.tripId).toBe(trip.tripId);
    expect(row.p50ActiveSeconds).not.toBeNull();
    expect(row.longestSequenceIntervals).toBeGreaterThan(0);
  });

  it('does not change legacy RPM_1HZ classification when tier is attached', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
    const legacy = classifySingleTripRpmProfile({
      trip: evidence.tripWindows[0]!,
      points: evidence.points,
    });
    expect(legacy.profile).toBe('RPM_1HZ');
    const tier = classifySingleTripRpmCadenceTier({
      trip: evidence.tripWindows[0]!,
      points: evidence.points,
    });
    expect(tier.tier).toBe('RPM_1S');
  });

  it('mergeRpmCadenceTierResolutionOntoEngineRpmCadence preserves cadenceSemanticFingerprint', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
    const base = analyzeEngineRpmCadence(evidence);
    const beforeFp = base.cadenceSemanticFingerprint;
    const merged = mergeRpmCadenceTierResolutionOntoEngineRpmCadence(base, evidence);
    expect(merged.cadenceSemanticFingerprint).toBe(beforeFp);
    expect(merged.rpmCadenceTierResolution?.contractVersion).toBe(
      'vsi-rpm-cadence-tier-resolution-v1',
    );
    expect(merged.rpmCadenceTierResolution?.tripClassifications[0]?.tripId).toBe(trip.tripId);
  });

  it('resolveRpmCadenceTierResolutionV1 exposes provenance and evidenceObservedAt', () => {
    const trips = cohort.fleets.tiguan.trips.slice(0, 4);
    const evidence = buildRpmEvidenceFromIntervalReplayTrips(trips);
    const resolution = resolveRpmCadenceTierResolutionV1(evidence)!;
    expect(resolution.provenance).toEqual(
      expect.arrayContaining(['CLICKHOUSE_TELEMETRY_HF_POINTS', 'VSI_RPM_CADENCE_TIER_RESOLVER_V1']),
    );
    expect(resolution.evidenceObservedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resolution.evaluatedTripIds.length).toBeLessThanOrEqual(4);
  });

  it('enricher attaches rpmCadenceTierResolution on engine_rpm cadence', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
    const evalBase: VsiProfileEvaluationResult = {
      contractVersion: 'vsi-signal-profile-v2',
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      providerSourceLinkId: 'link-a',
      providerIdentity: 'DIMO',
      verifiedModality: null,
      telemetrySourceFamily: null,
      evaluatedAt: new Date('2026-10-20T12:00:00.000Z'),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: null,
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      profileLimitations: [],
      signals: [
        {
          canonicalSignalKey: 'engine_rpm',
          providerNativeSignalName: 'powertrainCombustionEngineSpeed',
          declaredSupport: 'LISTED',
          empiricalObservation: 'OBSERVED',
          lastValidObservationAt: '2026-10-20T12:00:00.000Z',
          lastSourceTimestamp: '2026-10-20T12:00:00.000Z',
          lastProviderFetchAt: '2026-10-20T12:00:01.000Z',
          lastProvenStrictSourceAdvanceAt: null,
          strictSourceAdvanced: 'UNKNOWN',
          freshnessClassification: 'FRESH',
          evidenceProvenance: ['VEHICLE_LATEST_STATE'],
          limitations: [],
          signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
          qualityClassification: 'OBSERVED_FRESH',
          confidenceLevel: 'MEDIUM',
          observedSamples: null,
          provenSourceAdvances: null,
          observedCadenceMedianSeconds: null,
          observedCadenceSampleCount: null,
          maxStaleIntervalSeconds: null,
          contentFingerprint: 'x',
        },
      ],
    };
    const enriched = enrichVsiProfileWithCadenceIntelligence(evalBase, {
      rpmEvidence: evidence,
      lvEvidence: null,
    });
    const tierBlock = enriched.signals[0]?.cadenceIntelligence?.rpmCadenceTierResolution;
    expect(tierBlock?.contractVersion).toBe('vsi-rpm-cadence-tier-resolution-v1');
    const pure = classifyVsiRpmCadenceTierV1({
      intervalsSec: [...trip.intervalsSec],
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(tierBlock?.tripClassifications[0]?.tier).toBe(pure.tier);
    expect(tierBlock?.tripClassifications[0]?.tripId).toBe(trip.tripId);
  });
});
