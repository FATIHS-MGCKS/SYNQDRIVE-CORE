import {
  enrichVsiProfileWithCadenceIntelligence,
  normalizeAttachedCadenceProvenance,
} from './vsi-profile-cadence.enricher';
import {
  buildVsiRpmCombinedEvidenceInputFromProfileSignal,
  resolveVsiRpmCombinedEvidenceAvailabilityV1,
} from './vsi-engine-rpm-combined-evidence-v1.util';
import { analyzeEngineRpmCadence, analyzeLvVoltageCadence } from './vsi-profile-cadence-stats.util';
import {
  fingerprintVsiProfileSemanticEvaluation,
} from './vsi-profile-fingerprint.util';
import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import type { VsiSignalCadenceIntelligenceV2 } from './vsi-profile-cadence.types';

const T0 = Date.parse('2026-10-01T10:00:00.000Z');

/** Production-shaped duplicate HF provenance (Tiguan / Audi / Arteon audit finding). */
const PRODUCTION_DUPLICATE_HF_PROVENANCE = [
  'CLICKHOUSE_TELEMETRY_HF_POINTS',
  'CLICKHOUSE_TELEMETRY_HF_POINTS',
] as const;

function minimalEval(
  signals: VsiProfileSignalFingerprintV1[],
): VsiProfileEvaluationResult {
  return {
    contractVersion: 'vsi-signal-profile-v2',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    providerSourceLinkId: 'link-1',
    providerIdentity: 'DIMO',
    verifiedModality: null,
    telemetrySourceFamily: null,
    evaluatedAt: new Date(T0),
    declaredCatalogCheckedAt: null,
    lastMaterializedSourceTimestamp: null,
    lastMaterializedProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    profileLimitations: [],
    signals,
  };
}

function engineRpmSignal(
  overrides: Partial<VsiProfileSignalFingerprintV1> = {},
): VsiProfileSignalFingerprintV1 {
  return {
    canonicalSignalKey: 'engine_rpm',
    providerNativeSignalName: 'powertrainCombustionEngineSpeed',
    declaredSupport: 'UNKNOWN',
    empiricalObservation: 'NEVER_OBSERVED',
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    lastProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: 'UNKNOWN',
    freshnessClassification: 'UNKNOWN',
    evidenceProvenance: ['VEHICLE_LATEST_STATE'],
    limitations: ['BASE_SIGNAL_LIMITATION'],
    signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
    qualityClassification: 'UNKNOWN',
    confidenceLevel: 'UNKNOWN',
    observedSamples: null,
    provenSourceAdvances: null,
    observedCadenceMedianSeconds: null,
    observedCadenceSampleCount: null,
    maxStaleIntervalSeconds: null,
    contentFingerprint: 'x',
    ...overrides,
  };
}

function productionLikeRpmCadenceWithDuplicateProvenance(): VsiSignalCadenceIntelligenceV2 {
  const trip = { tripId: 't-prod', startMs: T0, endMs: T0 + 120_000 };
  const base = analyzeEngineRpmCadence({
    iceRpmApplicability: 'APPLICABLE',
    tripWindows: [trip],
    points: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => ({
      recordedAtMs: T0 + s * 1000,
      value: 1800,
    })),
    provenance: [...PRODUCTION_DUPLICATE_HF_PROVENANCE],
    hfReadStatus: 'SUCCESS',
  });
  return {
    ...base,
    provenance: [...PRODUCTION_DUPLICATE_HF_PROVENANCE],
    activeRpmProfile: {
      contractVersion: 'vsi-active-rpm-profile-v1',
      activeProfile: 'RPM_1HZ',
      agreementRatio: 0.8,
      evaluatedTripIds: ['t-prod'],
      qualifyingTripCount: 1,
      tripClassifications: [],
      classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
      classificationDecisionSummary: 'fixture',
      profileSemanticFingerprint: 'prod-fp',
    },
    rpmCadenceTierResolution: {
      contractVersion: 'vsi-rpm-cadence-tier-resolution-v1',
      evaluatedTripIds: ['t-prod'],
      tripClassifications: [],
      rollingVehicleTierSummary: null,
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'VSI_RPM_CADENCE_TIER_RESOLVER_V1'],
      evidenceObservedAt: new Date(T0 + 10_000).toISOString(),
    },
  };
}

function snapshotHookEnrichWithPrior(
  priorCadence: VsiSignalCadenceIntelligenceV2,
): VsiProfileEvaluationResult {
  return enrichVsiProfileWithCadenceIntelligence(minimalEval([engineRpmSignal()]), {
    rpmEvidence: null,
    lvEvidence: null,
    priorCadenceByKey: new Map([['engine_rpm', priorCadence]]),
  });
}

function rpmRefreshEnrich(
  lifecycle: 'TRIP' | 'BACKFILL' | 'MANUAL',
): VsiProfileEvaluationResult {
  void lifecycle;
  const trip = { tripId: 't1', startMs: T0, endMs: T0 + 60_000 };
  return enrichVsiProfileWithCadenceIntelligence(minimalEval([engineRpmSignal()]), {
    rpmEvidence: {
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [trip],
      points: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => ({
        recordedAtMs: T0 + s * 1000,
        value: 1500,
      })),
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS',
    },
    lvEvidence: null,
  });
}

describe('VSI P1-G cadence provenance carry-forward', () => {
  describe('normalizeAttachedCadenceProvenance', () => {
    it('dedupes duplicate tags preserving first-seen order', () => {
      const cadence = productionLikeRpmCadenceWithDuplicateProvenance();
      const normalized = normalizeAttachedCadenceProvenance(cadence);
      expect(normalized.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);
      expect(normalized.observedSampleCount).toBe(cadence.observedSampleCount);
      expect(normalized.cadenceSemanticFingerprint).toBe(cadence.cadenceSemanticFingerprint);
    });

    it('is idempotent for already-unique provenance', () => {
      const cadence = analyzeEngineRpmCadence({
        iceRpmApplicability: 'APPLICABLE',
        tripWindows: [{ tripId: 't', startMs: T0, endMs: T0 + 10_000 }],
        points: [
          { recordedAtMs: T0, value: 900 },
          { recordedAtMs: T0 + 1000, value: 900 },
          { recordedAtMs: T0 + 2000, value: 900 },
        ],
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        hfReadStatus: 'SUCCESS',
      });
      const once = normalizeAttachedCadenceProvenance(cadence);
      const twice = normalizeAttachedCadenceProvenance(once);
      expect(twice).toBe(once);
    });

    it('handles empty provenance', () => {
      const cadence = analyzeEngineRpmCadence({
        iceRpmApplicability: 'APPLICABLE',
        tripWindows: [],
        points: [],
        provenance: [],
        hfReadStatus: 'EMPTY',
      });
      expect(normalizeAttachedCadenceProvenance(cadence).provenance).toEqual([]);
    });
  });

  describe('SNAPSHOT_HOOK (rpmEvidence null)', () => {
    it('normalizes historical duplicate HF provenance without recomputing cadence metrics', () => {
      const prior = productionLikeRpmCadenceWithDuplicateProvenance();
      const result = snapshotHookEnrichWithPrior(prior);
      const rpm = result.signals[0]?.cadenceIntelligence;
      expect(rpm?.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);
      expect(rpm?.observedSampleCount).toBe(prior.observedSampleCount);
      expect(rpm?.intervalMedianSeconds).toBe(prior.intervalMedianSeconds);
      expect(rpm?.cadenceSemanticFingerprint).toBe(prior.cadenceSemanticFingerprint);
      expect(rpm?.activeRpmProfile).toEqual(prior.activeRpmProfile);
      expect(rpm?.rpmCadenceTierResolution).toEqual(prior.rpmCadenceTierResolution);
    });

    it('leaves unique provenance and metrics unchanged (referential when clean)', () => {
      const prior = analyzeEngineRpmCadence({
        iceRpmApplicability: 'APPLICABLE',
        tripWindows: [{ tripId: 't', startMs: T0, endMs: T0 + 10_000 }],
        points: [
          { recordedAtMs: T0, value: 900 },
          { recordedAtMs: T0 + 1000, value: 900 },
          { recordedAtMs: T0 + 2000, value: 900 },
        ],
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        hfReadStatus: 'SUCCESS',
      });
      const result = snapshotHookEnrichWithPrior(prior);
      expect(result.signals[0]?.cadenceIntelligence?.provenance).toEqual([
        'CLICKHOUSE_TELEMETRY_HF_POINTS',
      ]);
      expect(result.signals[0]?.cadenceIntelligence?.observedSampleCount).toBe(
        prior.observedSampleCount,
      );
    });

    it('is idempotent across repeated snapshot-hook enrichment', () => {
      const prior = productionLikeRpmCadenceWithDuplicateProvenance();
      const first = snapshotHookEnrichWithPrior(prior);
      const firstCadence = first.signals[0]!.cadenceIntelligence!;
      const second = snapshotHookEnrichWithPrior(firstCadence);
      expect(second.signals[0]?.cadenceIntelligence?.provenance).toEqual([
        'CLICKHOUSE_TELEMETRY_HF_POINTS',
      ]);
      expect(fingerprintVsiProfileSemanticEvaluation(first)).toBe(
        fingerprintVsiProfileSemanticEvaluation(second),
      );
    });

  });

  describe('RPM refresh lifecycles (analyzer path)', () => {
    it.each(['TRIP', 'BACKFILL', 'MANUAL'] as const)(
      '%s path yields single HF provenance tag',
      (mode) => {
        const result = rpmRefreshEnrich(mode);
        expect(result.signals[0]?.cadenceIntelligence?.provenance).toEqual([
          'CLICKHOUSE_TELEMETRY_HF_POINTS',
        ]);
      },
    );
  });

  describe('LV cadence attach', () => {
    it('normalizes duplicate LV provenance on snapshot carry-forward without changing samples', () => {
      const lvBase = analyzeLvVoltageCadence({
        points: [
          { observedAtMs: T0, providerTimestampMs: T0 },
          { observedAtMs: T0 + 60_000, providerTimestampMs: T0 + 60_000 },
          { observedAtMs: T0 + 120_000, providerTimestampMs: T0 + 120_000 },
        ],
        provenance: [
          'POSTGRES_BATTERY_MEASUREMENTS',
          'POSTGRES_BATTERY_MEASUREMENTS',
        ],
        linkActivatedAtMs: T0 - 1000,
        linkDeactivatedAtMs: null,
      });
      const lvSignal = engineRpmSignal({
        canonicalSignalKey: 'lv_voltage',
        providerNativeSignalName: 'lowVoltageBatteryCurrentVoltage',
      });
      const result = enrichVsiProfileWithCadenceIntelligence(minimalEval([lvSignal]), {
        rpmEvidence: null,
        lvEvidence: null,
        priorCadenceByKey: new Map([['lv_voltage', lvBase]]),
      });
      const lv = result.signals[0]?.cadenceIntelligence;
      expect(lv?.provenance).toEqual(['POSTGRES_BATTERY_MEASUREMENTS']);
      expect(lv?.observedSampleCount).toBe(lvBase.observedSampleCount);
    });
  });

  describe('combined evidence + attribution (P1-D regression)', () => {
    it('availability unchanged when deduping duplicate HF provenance on attach', () => {
      const prior = productionLikeRpmCadenceWithDuplicateProvenance();
      const beforeSignal = engineRpmSignal({ cadenceIntelligence: prior });
      const afterSignal = snapshotHookEnrichWithPrior(prior).signals[0]!;

      const beforeInput = buildVsiRpmCombinedEvidenceInputFromProfileSignal({
        rpmApplicability: 'APPLICABLE',
        profileLimitations: [],
        signal: beforeSignal,
      });
      const afterInput = buildVsiRpmCombinedEvidenceInputFromProfileSignal({
        rpmApplicability: 'APPLICABLE',
        profileLimitations: [],
        signal: afterSignal,
      });

      expect(resolveVsiRpmCombinedEvidenceAvailabilityV1(beforeInput)).toEqual(
        resolveVsiRpmCombinedEvidenceAvailabilityV1(afterInput),
      );
      expect(afterInput.cadence.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);
    });
  });

  describe('production cohort fixtures (Tiguan / Audi / Arteon isolation)', () => {
    const vehicleIds = {
      Tiguan: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      Audi: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      Arteon: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    };

    it.each(Object.entries(vehicleIds))(
      '%s snapshot-hook clears duplicate HF tags on attach',
      (_label, vehicleId) => {
        const prior = productionLikeRpmCadenceWithDuplicateProvenance();
        const evalRow = minimalEval([engineRpmSignal()]);
        evalRow.vehicleId = vehicleId;
        const result = enrichVsiProfileWithCadenceIntelligence(evalRow, {
          rpmEvidence: null,
          lvEvidence: null,
          priorCadenceByKey: new Map([['engine_rpm', prior]]),
        });
        expect(result.signals[0]?.cadenceIntelligence?.provenance).toEqual([
          'CLICKHOUSE_TELEMETRY_HF_POINTS',
        ]);
      },
    );
  });
});
