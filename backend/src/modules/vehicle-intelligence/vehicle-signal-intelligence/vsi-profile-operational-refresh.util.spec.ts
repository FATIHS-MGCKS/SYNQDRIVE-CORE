import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import {
  VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
  type VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';
import {
  buildOperationalProfileRefreshCasWhere,
  buildOperationalProfileRefreshUpdate,
  isActiveRpmProfileEvidenceMonotonic,
  isIncomingActiveRpmEvidenceMonotonic,
  isRpmCadenceTierResolutionEvidenceMonotonic,
  mergeOperationalCadenceIntelligence,
  mergeOperationalSignalSnapshots,
} from './vsi-profile-operational-refresh.util';

function signalRow(
  key: VsiProfileSignalFingerprintV1['canonicalSignalKey'],
  overrides: Partial<VsiProfileSignalFingerprintV1> = {},
): VsiProfileSignalFingerprintV1 {
  return {
    canonicalSignalKey: key,
    providerNativeSignalName: key,
    declaredSupport: 'LISTED',
    empiricalObservation: 'OBSERVED',
    lastValidObservationAt: '2026-10-15T12:00:00.000Z',
    lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
    lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
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
    contentFingerprint: 'fp',
    ...overrides,
  };
}

function evaluation(
  signals: VsiProfileSignalFingerprintV1[],
  overrides: Partial<VsiProfileEvaluationResult> = {},
): VsiProfileEvaluationResult {
  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    providerIdentity: 'DIMO',
    verifiedModality: null,
    telemetrySourceFamily: null,
    evaluatedAt: new Date('2026-10-15T12:00:05.000Z'),
    declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
    lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
    lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:05.000Z'),
    lastProvenStrictSourceAdvanceAt: null,
    signals,
    profileLimitations: [],
    ...overrides,
  };
}

describe('vsi-profile-operational-refresh.util', () => {
  it('mergeOperationalSignalSnapshots keeps the later lastProviderFetchAt', () => {
    const persisted = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:10.000Z' })];
    const incoming = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:05.000Z' })];
    const merged = mergeOperationalSignalSnapshots(persisted, incoming);
    expect(merged[0]?.lastProviderFetchAt).toBe('2026-10-15T12:00:10.000Z');
  });

  it('buildOperationalProfileRefreshUpdate rejects stale semantic evaluation', () => {
    const persistedSignals = [signalRow('lv_voltage', { lastValidObservationAt: '2026-10-15T12:00:00.000Z' })];
    const staleSignals = [
      signalRow('lv_voltage', {
        lastValidObservationAt: '2026-10-14T12:00:00.000Z',
        lastSourceTimestamp: '2026-10-14T12:00:00.000Z',
      }),
    ];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:01.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:01.000Z'),
      },
      evaluation: evaluation(staleSignals),
      semanticFingerprint: 'fp',
    });
    expect(update).toBeNull();
  });

  it('buildOperationalProfileRefreshUpdate does not move fetch timestamps backward', () => {
    const persistedSignals = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:10.000Z' })];
    const incomingSignals = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:05.000Z' })];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      },
      evaluation: evaluation(incomingSignals, {
        evaluatedAt: new Date('2026-10-15T12:00:05.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:05.000Z'),
      }),
      semanticFingerprint: 'fp',
    });
    expect(update).toBeNull();
  });

  it('isIncomingActiveRpmEvidenceMonotonic rejects older rolling window (trips 1–5 after 2–6)', () => {
    const base = Date.parse('2026-10-27T00:00:00.000Z');
    const mkProfile = (suffix: string, endOffset: number) => ({
      contractVersion: 'vsi-active-rpm-profile-v1' as const,
      activeProfile: 'RPM_1HZ' as const,
      evaluatedTripIds: [`trip-${suffix}`],
      qualifyingTripCount: 1,
      agreementRatio: 1,
      classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
      classificationDecisionSummary: 'ok',
      tripClassifications: [
        {
          tripId: `trip-${suffix}`,
          endMs: base + endOffset,
          profile: 'RPM_1HZ' as const,
          intervalMedianSeconds: 1,
          intervalP95Seconds: 2,
          intervalCount: 40,
          rpmPointCount: 50,
          fractionIntervalsLe2s: 0.9,
          decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
        },
      ],
      profileSemanticFingerprint: 'rpm-profile-fp',
    });
    const cadence = (profile: ReturnType<typeof mkProfile>) => ({
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 50,
      distinctTimestampCount: 50,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.4,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
      activeRpmProfile: profile,
    });
    const newer = cadence(mkProfile('f', 6 * 7_200_000));
    const older = cadence(mkProfile('a', 0));
    expect(isIncomingActiveRpmEvidenceMonotonic(newer, older)).toBe(false);
    expect(isIncomingActiveRpmEvidenceMonotonic(older, newer)).toBe(true);
  });

  it('mergeOperationalCadenceIntelligence rejects stale activeRpmProfile after newer evidence persisted', () => {
    const base = Date.parse('2026-10-27T00:00:00.000Z');
    const tripRow = (id: string, idx: number) => ({
      tripId: id,
      endMs: base + idx * 7_200_000,
      profile: 'RPM_1HZ' as const,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      intervalCount: 40,
      rpmPointCount: 50,
      fractionIntervalsLe2s: 0.9,
      decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
    });
    const cadenceBase = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 100,
      distinctTimestampCount: 100,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.5,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
    };
    const persistedCadence: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      activeRpmProfile: {
        contractVersion: 'vsi-active-rpm-profile-v1' as const,
        activeProfile: 'RPM_1HZ' as const,
        evaluatedTripIds: ['t2', 't3', 't4', 't5', 't6'],
        qualifyingTripCount: 5,
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'newer',
        tripClassifications: [2, 3, 4, 5, 6].map((i) => tripRow(`t${i}`, i)),
        profileSemanticFingerprint: 'rpm-profile-fp',
      },
    };
    const staleIncoming: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      activeRpmProfile: {
        ...persistedCadence.activeRpmProfile!,
        evaluatedTripIds: ['t1', 't2', 't3', 't4', 't5'],
        classificationDecisionSummary: 'stale',
        tripClassifications: [1, 2, 3, 4, 5].map((i) => tripRow(`t${i}`, i)),
      },
    };
    const merged = mergeOperationalCadenceIntelligence(persistedCadence, staleIncoming);
    expect(merged?.activeRpmProfile?.evaluatedTripIds).toEqual(['t2', 't3', 't4', 't5', 't6']);
  });

  it('mergeOperationalCadenceIntelligence still refreshes lv_voltage cadence without activeRpmProfile', () => {
    const cadence = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'MEDIUM' as const,
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      limitations: [],
      observedSampleCount: 10,
      distinctTimestampCount: 10,
      intervalMedianSeconds: 120,
      intervalP95Seconds: 180,
      maxIntraWindowGapSeconds: 180,
      activeWindowCoverageRatio: null,
      finalizedTripCount: null,
      regimes: [],
      observedDensityLabel: 'SUB_ONE_HZ' as const,
      cadenceSemanticFingerprint: 'lv-fp',
    };
    const merged = mergeOperationalCadenceIntelligence(
      { ...cadence, observedSampleCount: 8 },
      { ...cadence, observedSampleCount: 12 },
    );
    expect(merged?.observedSampleCount).toBe(12);
    expect(merged?.activeRpmProfile).toBeUndefined();
  });

  it('mergeOperationalCadenceIntelligence refreshes activeRpmProfile when cadence fingerprint is stable', () => {
    const cadenceBase = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 100,
      distinctTimestampCount: 100,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.5,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
    };
    const persistedCadence: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      activeRpmProfile: {
        contractVersion: 'vsi-active-rpm-profile-v1' as const,
        activeProfile: 'RPM_1HZ' as const,
        evaluatedTripIds: ['trip-a', 'trip-b', 'trip-c', 'trip-d', 'trip-e'],
        qualifyingTripCount: 5,
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'ok',
        tripClassifications: [
          { tripId: 'trip-a', endMs: 1, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-b', endMs: 2, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-c', endMs: 3, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-d', endMs: 4, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-e', endMs: 5, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
        ],
        profileSemanticFingerprint: 'rpm-profile-fp',
      },
    };
    const incomingCadence: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      activeRpmProfile: {
        ...persistedCadence.activeRpmProfile!,
        evaluatedTripIds: ['trip-b', 'trip-c', 'trip-d', 'trip-e', 'trip-f'],
        classificationDecisionSummary: 'rolled',
        tripClassifications: [
          { tripId: 'trip-b', endMs: 2, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-c', endMs: 3, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-d', endMs: 4, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-e', endMs: 5, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
          { tripId: 'trip-f', endMs: 6, profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 40, rpmPointCount: 50, fractionIntervalsLe2s: 0.9, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' },
        ],
      },
    };
    const merged = mergeOperationalCadenceIntelligence(persistedCadence, incomingCadence);
    expect(merged?.activeRpmProfile?.evaluatedTripIds).toEqual([
      'trip-b',
      'trip-c',
      'trip-d',
      'trip-e',
      'trip-f',
    ]);
    expect(merged?.cadenceSemanticFingerprint).toBe('cadence-fp-stable');
  });

  it('mergeOperationalCadenceIntelligence refreshes rpmCadenceTierResolution when fingerprint is stable', () => {
    const cadenceBase = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 100,
      distinctTimestampCount: 100,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.5,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-tier',
    };
    const tierTrip = (tripId: string, endMs: number) => ({
      tripId,
      endMs,
      tier: 'RPM_1S' as const,
      cadenceConfidence: 'HIGH' as const,
      tripCoverageBand: 'FULL_SPAN' as const,
      analysisReadiness: 'TIER_ANALYTICS_OK' as const,
      decisionCode: 'TIER_ASSIGNED' as const,
      intervalEvidenceUsed: {
        rpmPointCount: 50,
        activeIntervalCount: 49,
        tripDurationSeconds: 400,
      },
      p50ActiveSeconds: 1,
      p75ActiveSeconds: 1,
      p90ActiveSeconds: 2,
      activeSpanRatio: 0.5,
      activeDensityVsTier: 1,
      tierPuritySharePlusOne: 0.9,
      longestSequenceIntervals: 20,
    });
    const persistedCadence: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      rpmCadenceTierResolution: {
        contractVersion: 'vsi-rpm-cadence-tier-resolution-v1',
        evaluatedTripIds: ['trip-a', 'trip-b', 'trip-c', 'trip-d', 'trip-e'],
        tripClassifications: [
          tierTrip('trip-a', 1),
          tierTrip('trip-b', 2),
          tierTrip('trip-c', 3),
          tierTrip('trip-d', 4),
          tierTrip('trip-e', 5),
        ],
        rollingVehicleTierSummary: {
          tier: 'RPM_1S',
          agreementRatio: 1,
          classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
          classificationDecisionSummary: 'ok',
          sufficientEvidence: true,
        },
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        evidenceObservedAt: '2026-10-27T00:00:00.000Z',
      },
    };
    const incomingCadence: VsiSignalCadenceIntelligenceV2 = {
      ...cadenceBase,
      rpmCadenceTierResolution: {
        ...persistedCadence.rpmCadenceTierResolution!,
        evaluatedTripIds: ['trip-b', 'trip-c', 'trip-d', 'trip-e', 'trip-f'],
        tripClassifications: [
          tierTrip('trip-b', 2),
          tierTrip('trip-c', 3),
          tierTrip('trip-d', 4),
          tierTrip('trip-e', 5),
          tierTrip('trip-f', 6),
        ],
      },
    };
    const merged = mergeOperationalCadenceIntelligence(persistedCadence, incomingCadence);
    expect(merged?.rpmCadenceTierResolution?.evaluatedTripIds).toEqual([
      'trip-b',
      'trip-c',
      'trip-d',
      'trip-e',
      'trip-f',
    ]);
  });

  describe('independent legacy vs tier rolling monotonicity', () => {
    const cadenceFp = 'cadence-fp-independent';
    const cadenceBase = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 100,
      distinctTimestampCount: 100,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.5,
      finalizedTripCount: 1,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: cadenceFp,
    };

    const legacyProfile = (endMs: number) => ({
      contractVersion: 'vsi-active-rpm-profile-v1' as const,
      activeProfile: 'RPM_1HZ' as const,
      evaluatedTripIds: [`trip-${endMs}`],
      qualifyingTripCount: 1,
      agreementRatio: 1,
      classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
      classificationDecisionSummary: 'ok',
      tripClassifications: [
        {
          tripId: `trip-${endMs}`,
          endMs,
          profile: 'RPM_1HZ' as const,
          intervalMedianSeconds: 1,
          intervalP95Seconds: 2,
          intervalCount: 40,
          rpmPointCount: 50,
          fractionIntervalsLe2s: 0.9,
          decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
        },
      ],
      profileSemanticFingerprint: 'rpm-profile-fp',
    });

    const tierResolution = (endMs: number, tierLabel = 'RPM_1S') => ({
      contractVersion: 'vsi-rpm-cadence-tier-resolution-v1' as const,
      evaluatedTripIds: [`trip-tier-${endMs}`],
      tripClassifications: [
        {
          tripId: `trip-tier-${endMs}`,
          endMs,
          tier: tierLabel as 'RPM_1S',
          cadenceConfidence: 'HIGH' as const,
          tripCoverageBand: 'FULL_SPAN' as const,
          analysisReadiness: 'TIER_ANALYTICS_OK' as const,
          decisionCode: 'TIER_ASSIGNED' as const,
          intervalEvidenceUsed: {
            rpmPointCount: 50,
            activeIntervalCount: 49,
            tripDurationSeconds: 400,
          },
          p50ActiveSeconds: 1,
          p75ActiveSeconds: 1,
          p90ActiveSeconds: 2,
          activeSpanRatio: 0.5,
          activeDensityVsTier: 1,
          tierPuritySharePlusOne: 0.9,
          longestSequenceIntervals: 20,
        },
      ],
      rollingVehicleTierSummary: {
        tier: tierLabel as 'RPM_1S',
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'ok',
        sufficientEvidence: true,
      },
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      evidenceObservedAt: new Date(endMs).toISOString(),
    });

    const mkCadence = (legacyEndMs: number, tierEndMs: number): VsiSignalCadenceIntelligenceV2 => ({
      ...cadenceBase,
      activeRpmProfile: legacyProfile(legacyEndMs),
      rpmCadenceTierResolution: tierResolution(tierEndMs),
    });

    it('merges fresh legacy (121) but keeps persisted tier when incoming tier is stale (90 vs 100)', () => {
      const persisted = mkCadence(120, 100);
      const incoming = mkCadence(121, 90);
      const merged = mergeOperationalCadenceIntelligence(persisted, incoming)!;
      expect(merged.activeRpmProfile?.tripClassifications[0]?.endMs).toBe(121);
      expect(merged.rpmCadenceTierResolution?.tripClassifications[0]?.endMs).toBe(100);
      expect(merged.rpmCadenceTierResolution?.evaluatedTripIds).toEqual(['trip-tier-100']);
      expect(isActiveRpmProfileEvidenceMonotonic(persisted, incoming)).toBe(true);
      expect(isRpmCadenceTierResolutionEvidenceMonotonic(persisted, incoming)).toBe(false);
      expect(isIncomingActiveRpmEvidenceMonotonic(persisted, incoming)).toBe(true);
    });

    it('merges fresh tier (110) but keeps persisted legacy when incoming legacy is stale (119 vs 120)', () => {
      const persisted = mkCadence(120, 100);
      const incoming = mkCadence(119, 110);
      const merged = mergeOperationalCadenceIntelligence(persisted, incoming)!;
      expect(merged.activeRpmProfile?.tripClassifications[0]?.endMs).toBe(120);
      expect(merged.rpmCadenceTierResolution?.tripClassifications[0]?.endMs).toBe(110);
      expect(isActiveRpmProfileEvidenceMonotonic(persisted, incoming)).toBe(false);
      expect(isRpmCadenceTierResolutionEvidenceMonotonic(persisted, incoming)).toBe(true);
    });

    it('accepts identical max endMs when evaluatedTripIds match', () => {
      const persisted = mkCadence(120, 120);
      const incoming = {
        ...mkCadence(120, 120),
        observedSampleCount: 101,
      };
      expect(isActiveRpmProfileEvidenceMonotonic(persisted, incoming)).toBe(true);
      expect(isRpmCadenceTierResolutionEvidenceMonotonic(persisted, incoming)).toBe(true);
      const merged = mergeOperationalCadenceIntelligence(persisted, incoming)!;
      expect(merged.observedSampleCount).toBe(101);
    });

    it('rejects merge when both blocks regress', () => {
      const persisted = mkCadence(120, 100);
      const incoming = mkCadence(119, 90);
      expect(isIncomingActiveRpmEvidenceMonotonic(persisted, incoming)).toBe(false);
      expect(mergeOperationalCadenceIntelligence(persisted, incoming)).toBe(persisted);
    });

    it('rejects incoming that drops persisted rolling blocks (missing HF)', () => {
      const persisted = mkCadence(120, 100);
      const incoming: VsiSignalCadenceIntelligenceV2 = {
        ...cadenceBase,
      };
      expect(isActiveRpmProfileEvidenceMonotonic(persisted, incoming)).toBe(false);
      expect(isRpmCadenceTierResolutionEvidenceMonotonic(persisted, incoming)).toBe(false);
      expect(mergeOperationalCadenceIntelligence(persisted, incoming)).toBe(persisted);
    });

    it('sequential partial merges compose without cross-block stale overwrite', () => {
      const persisted = mkCadence(120, 100);
      const afterLegacy = mergeOperationalCadenceIntelligence(persisted, mkCadence(121, 90))!;
      expect(afterLegacy.activeRpmProfile?.tripClassifications[0]?.endMs).toBe(121);
      expect(afterLegacy.rpmCadenceTierResolution?.tripClassifications[0]?.endMs).toBe(100);

      const finalMerged = mergeOperationalCadenceIntelligence(afterLegacy, mkCadence(119, 110))!;
      expect(finalMerged.activeRpmProfile?.tripClassifications[0]?.endMs).toBe(121);
      expect(finalMerged.rpmCadenceTierResolution?.tripClassifications[0]?.endMs).toBe(110);
    });
  });

  it('mergeOperationalCadenceIntelligence keeps persisted cadence when semantic fingerprint diverges', () => {
    const persisted = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 1,
      distinctTimestampCount: 1,
      intervalMedianSeconds: 6,
      intervalP95Seconds: 8,
      maxIntraWindowGapSeconds: 8,
      activeWindowCoverageRatio: null,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'SUB_ONE_HZ' as const,
      cadenceSemanticFingerprint: 'cadence-fp-a',
    };
    const incoming = { ...persisted, cadenceSemanticFingerprint: 'cadence-fp-b' };
    expect(mergeOperationalCadenceIntelligence(persisted, incoming)?.cadenceSemanticFingerprint).toBe(
      'cadence-fp-a',
    );
  });

  it('buildOperationalProfileRefreshUpdate applies cadence operational refresh without fetch advance', () => {
    const cadence = (tripIds: string[], endMsStart = 10) => ({
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      limitations: [],
      observedSampleCount: 50,
      distinctTimestampCount: 50,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.4,
      finalizedTripCount: tripIds.length,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
      activeRpmProfile: {
        contractVersion: 'vsi-active-rpm-profile-v1' as const,
        activeProfile: 'RPM_1HZ' as const,
        evaluatedTripIds: tripIds,
        qualifyingTripCount: tripIds.length,
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'ok',
        tripClassifications: tripIds.map((id, i) => ({
          tripId: id,
          endMs: endMsStart + i,
          profile: 'RPM_1HZ' as const,
          intervalMedianSeconds: 1,
          intervalP95Seconds: 2,
          intervalCount: 40,
          rpmPointCount: 50,
          fractionIntervalsLe2s: 0.9,
          decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
        })),
        profileSemanticFingerprint: 'rpm-profile-fp',
      },
    });
    const persistedSignals = [
      signalRow('engine_rpm', {
        cadenceIntelligence: cadence(['t1', 't2', 't3', 't4', 't5'], 10),
      }),
    ];
    const incomingSignals = [
      signalRow('engine_rpm', {
        cadenceIntelligence: cadence(['t2', 't3', 't4', 't5', 't6'], 20),
      }),
    ];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      },
      evaluation: evaluation(incomingSignals, {
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      }),
      semanticFingerprint: 'profile-fp',
    });
    expect(update).not.toBeNull();
    const rpm = (update!.signalsSnapshot as VsiProfileSignalFingerprintV1[]).find(
      (s) => s.canonicalSignalKey === 'engine_rpm',
    );
    expect(rpm?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds).toEqual([
      't2',
      't3',
      't4',
      't5',
      't6',
    ]);
  });

  it('buildOperationalProfileRefreshCasWhere includes revision, updatedAt, and nullable fetch', () => {
    const at = new Date('2026-10-15T12:00:00.000Z');
    expect(
      buildOperationalProfileRefreshCasWhere({
        id: 'pid',
        profileRevision: 3,
        updatedAt: at,
        lastMaterializedProviderFetchAt: null,
      }),
    ).toEqual({
      id: 'pid',
      profileRevision: 3,
      updatedAt: at,
      lastMaterializedProviderFetchAt: null,
    });
  });
});
