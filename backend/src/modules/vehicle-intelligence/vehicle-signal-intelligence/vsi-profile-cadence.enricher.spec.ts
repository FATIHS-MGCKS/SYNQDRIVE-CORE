import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import { analyzeEngineRpmCadence } from './vsi-profile-cadence-stats.util';
import {
  fingerprintVsiProfileSemanticEvaluation,
  projectVsiSignalSemanticFingerprintFields,
} from './vsi-profile-fingerprint.util';
import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import type { VsiLvStandbyTransmissionEvidenceInput } from './vsi-profile-cadence.types';

const T0 = Date.parse('2026-10-01T10:00:00.000Z');

function minimalEval(
  signalOverrides: Partial<VsiProfileSignalFingerprintV1> = {},
): VsiProfileEvaluationResult {
  return {
    contractVersion: 'vsi-signal-profile-v2',
    organizationId: 'o',
    vehicleId: 'v',
    providerSourceLinkId: 'l',
    providerIdentity: 'DIMO',
    verifiedModality: null,
    telemetrySourceFamily: null,
    evaluatedAt: new Date(T0),
    declaredCatalogCheckedAt: null,
    lastMaterializedSourceTimestamp: null,
    lastMaterializedProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    profileLimitations: [],
    signals: [
      {
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
        evidenceProvenance: [],
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
        ...signalOverrides,
      },
    ],
  };
}

function rpmEvidenceSuccess() {
  const trip = { tripId: 't1', startMs: T0, endMs: T0 + 60_000 };
  return {
    iceRpmApplicability: 'APPLICABLE' as const,
    tripWindows: [trip],
    points: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => ({
      recordedAtMs: T0 + s * 1000,
      value: 1500,
    })),
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    hfReadStatus: 'SUCCESS' as const,
  };
}

describe('vsi-profile-cadence.enricher', () => {
  it('preserves prior RPM cadence when ClickHouse is unavailable', () => {
    const priorBase = analyzeEngineRpmCadence({
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [],
      points: [{ recordedAtMs: 1, value: 100 }],
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS',
    });
    const prior = {
      ...priorBase,
      rpmCadenceTierResolution: {
        contractVersion: 'vsi-rpm-cadence-tier-resolution-v1' as const,
        evaluatedTripIds: ['prior-trip'],
        tripClassifications: [],
        rollingVehicleTierSummary: null,
        provenance: ['PRIOR'],
        evidenceObservedAt: '2026-10-01T00:00:00.000Z',
      },
    };
    const result = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: {
        iceRpmApplicability: 'APPLICABLE',
        tripWindows: [],
        points: [],
        provenance: [],
        hfReadStatus: 'UNAVAILABLE',
      },
      lvEvidence: null,
      priorCadenceByKey: new Map([['engine_rpm', prior]]),
    });
    const rpm = result.signals[0]?.cadenceIntelligence;
    expect(rpm?.cadenceSemanticFingerprint).toBe(prior.cadenceSemanticFingerprint);
    expect(rpm?.observedSampleCount).toBe(prior.observedSampleCount);
    expect(rpm?.rpmCadenceTierResolution).toEqual(prior.rpmCadenceTierResolution);
    expect(result.signals[0]?.limitations).toEqual(
      expect.arrayContaining(prior.limitations),
    );
  });

  it('trip-triggered and snapshot-hook projections match when evidence is unchanged', () => {
    const tripEval = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: rpmEvidenceSuccess(),
      lvEvidence: null,
    });
    const prior = new Map([
      ['engine_rpm', tripEval.signals[0]!.cadenceIntelligence!],
    ]);
    const snapshotEval = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: null,
      lvEvidence: null,
      priorCadenceByKey: prior,
    });

    const tripProjection = projectVsiSignalSemanticFingerprintFields(tripEval.signals[0]!);
    const snapshotProjection = projectVsiSignalSemanticFingerprintFields(
      snapshotEval.signals[0]!,
    );
    expect(snapshotProjection).toEqual(tripProjection);
    expect(fingerprintVsiProfileSemanticEvaluation(tripEval)).toBe(
      fingerprintVsiProfileSemanticEvaluation(snapshotEval),
    );
  });

  it('alternating trip and snapshot enrichment does not change semantic fingerprint', () => {
    const tripA = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: rpmEvidenceSuccess(),
      lvEvidence: null,
    });
    const fpA = fingerprintVsiProfileSemanticEvaluation(tripA);
    const prior = new Map([['engine_rpm', tripA.signals[0]!.cadenceIntelligence!]]);

    const snapB = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: null,
      lvEvidence: null,
      priorCadenceByKey: prior,
    });
    const fpB = fingerprintVsiProfileSemanticEvaluation(snapB);
    expect(fpB).toBe(fpA);

    const tripC = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: rpmEvidenceSuccess(),
      lvEvidence: null,
      priorCadenceByKey: prior,
    });
    expect(fingerprintVsiProfileSemanticEvaluation(tripC)).toBe(fpA);
  });

  it('genuine cadence drift changes semantic fingerprint', () => {
    const sparse = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: {
        ...rpmEvidenceSuccess(),
        points: [
          { recordedAtMs: T0, value: 1500 },
          { recordedAtMs: T0 + 60_000, value: 1500 },
          { recordedAtMs: T0 + 120_000, value: 1500 },
        ],
      },
      lvEvidence: null,
    });
    const dense = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: rpmEvidenceSuccess(),
      lvEvidence: null,
    });
    expect(fingerprintVsiProfileSemanticEvaluation(sparse)).not.toBe(
      fingerprintVsiProfileSemanticEvaluation(dense),
    );
  });

  it('V1 profiles without cadence fields remain compatible', () => {
    const v1Only = minimalEval();
    const result = enrichVsiProfileWithCadenceIntelligence(v1Only, {
      rpmEvidence: null,
      lvEvidence: null,
    });
    expect(result.signals[0]?.cadenceIntelligence).toBeUndefined();
    expect(fingerprintVsiProfileSemanticEvaluation(v1Only)).toBe(
      fingerprintVsiProfileSemanticEvaluation(result),
    );
  });

  it('attaches lvStandbyTransmissionProfile on lv_voltage without changing profile semantic fingerprint when label stable', () => {
    const lvEval = minimalEval({
      canonicalSignalKey: 'lv_voltage',
      providerNativeSignalName: 'lowVoltageBatteryCurrentVoltage',
    });
    const lvEvidence = {
      points: [
        { observedAtMs: T0, providerTimestampMs: T0 },
        { observedAtMs: T0 + 60_000, providerTimestampMs: T0 + 60_000 },
        { observedAtMs: T0 + 120_000, providerTimestampMs: T0 + 120_000 },
      ],
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: T0 - 1000,
      linkDeactivatedAtMs: null,
    };
    const mkStandbyEvidence = (extraPairs: number): VsiLvStandbyTransmissionEvidenceInput => {
      const points = [];
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < 5; i++) {
          const h = c * 90 + i * 8;
          points.push({
            observedAtMs: T0 + h * 3600 * 1000,
            providerTimestampMs: T0 + h * 3600 * 1000,
            providerObservationOutcome: 'NEW_OBSERVATION',
          });
        }
      }
      for (let i = 0; i < extraPairs; i++) {
        points.push({
          observedAtMs: T0 + (300 + i) * 3600 * 1000,
          providerTimestampMs: T0 + (300 + i) * 3600 * 1000,
          providerObservationOutcome: 'NEW_OBSERVATION',
        });
      }
      return {
        contractVersion: 'vsi-lv-standby-transmission-evidence-v1' as const,
        points,
        tripWindows: [],
        linkActivatedAtMs: T0 - 1000,
        linkDeactivatedAtMs: null,
        evidenceWindowDays: 30,
        windowStartMs: T0 - 30 * 86400000,
        windowEndMs: T0 + 30 * 86400000,
        provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
        loadIntegrity: {
          sourceLinkAttribution: 'VERIFIED',
          sourceLinkAttributionCode: 'VERIFIED',
          lvMeasurementWindowComplete: true,
          tripHistoryWindowComplete: true,
          activeOrIncompleteTripBlocksClassification: false,
        },
      } satisfies VsiLvStandbyTransmissionEvidenceInput;
    };
    const first = enrichVsiProfileWithCadenceIntelligence(lvEval, {
      rpmEvidence: null,
      lvEvidence,
      lvStandbyTransmissionEvidence: mkStandbyEvidence(0),
    });
    const second = enrichVsiProfileWithCadenceIntelligence(lvEval, {
      rpmEvidence: null,
      lvEvidence,
      lvStandbyTransmissionEvidence: mkStandbyEvidence(2),
    });
    const lv1 = first.signals[0]?.cadenceIntelligence?.lvStandbyTransmissionProfile;
    const lv2 = second.signals[0]?.cadenceIntelligence?.lvStandbyTransmissionProfile;
    expect(lv1?.profile).toBe('LV_8H_OBSERVED');
    expect(lv2?.profile).toBe('LV_8H_OBSERVED');
    expect(fingerprintVsiProfileSemanticEvaluation(first)).toBe(
      fingerprintVsiProfileSemanticEvaluation(second),
    );
  });
});
