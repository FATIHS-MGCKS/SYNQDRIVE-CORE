import type { Ds4RpmRealDataResearchReportV1 } from '../ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from '../ds4-rpm-real-data-replay.contract.v1';
import { buildDs4RpmRealDataResearchReportV1 } from '../ds4-rpm-real-data-research-report.v1';
import { executeDs4RpmRealDataOfflineReplayTripV1 } from '../ds4-rpm-real-data-replay-executor.v1';
import {
  Ds4RpmRealDataScientificIntegrityError,
  assertDs4RpmRealDataResearchReportScientificIntegrityV1,
  validateDs4RpmRealDataResearchReportScientificIntegrityV1,
} from '../ds4-rpm-real-data-scientific-output-guard.v1';
import { DS4_RPM_REAL_DATA_ALL_SCIENTIFIC_DISCLAIMER_CLAIMS } from '../ds4-rpm-real-data-scientific-claims.v1';
import { buildSyntheticApiBundleValid } from './ds4-rpm-real-data-replay-fixtures.harness';

const CODE_SHA = 'test-sha-scientific-guard-adversarial';
const GENERATED_AT = new Date('2026-11-04T08:00:00.000Z');

function minimalValidReport(
  overrides: Partial<Ds4RpmRealDataResearchReportV1> = {},
): Ds4RpmRealDataResearchReportV1 {
  const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildSyntheticApiBundleValid(GENERATED_AT), {
    codeSha: CODE_SHA,
    generatedAt: GENERATED_AT,
  });
  return {
    contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    reportId: 'adversarial-base',
    generatedAtIso: GENERATED_AT.toISOString(),
    codeSha: CODE_SHA,
    executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY',
    inputBundleFingerprints: [artifact.inputFingerprint],
    eligibilityCounts: { eligible: 0, blocked: 0, unproven: 1, notApplicable: 0 },
    contextClassificationTotals: {},
    sourceFamilyDistribution: { API_SYNTHETIC: 1 },
    localCadenceTierDistribution: {},
    alignmentStabilityDistribution: {},
    abstentionReasonHistogram: {},
    gapDeficiencySecondsSum: 0,
    gapDeficiencyEventCount: 0,
    tripArtifacts: [artifact],
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_ALL_SCIENTIFIC_DISCLAIMER_CLAIMS],
    ...overrides,
  };
}

describe('ds4-rpm-real-data scientific output guard enforcement', () => {
  it('accepts valid offline cohort report from builder', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(() =>
      buildDs4RpmRealDataResearchReportV1({
        reportId: 'valid-offline',
        codeSha: CODE_SHA,
        generatedAt: GENERATED_AT,
        tripArtifacts: [artifact],
      }),
    ).not.toThrow();
  });

  it('rejects injected ELIGIBLE trip artifact (fail closed)', () => {
    const base = minimalValidReport();
    const tampered = {
      ...base,
      eligibilityCounts: { ...base.eligibilityCounts, eligible: 1, unproven: 0 },
      tripArtifacts: [
        {
          ...base.tripArtifacts[0]!,
          eligibility: {
            ...base.tripArtifacts[0]!.eligibility,
            overallVerdict: 'ELIGIBLE' as const,
          },
        },
      ],
    };
    expect(() => assertDs4RpmRealDataResearchReportScientificIntegrityV1(tampered)).toThrow(
      Ds4RpmRealDataScientificIntegrityError,
    );
    expect(() =>
      buildDs4RpmRealDataResearchReportV1({
        reportId: 'never',
        codeSha: CODE_SHA,
        generatedAt: GENERATED_AT,
        tripArtifacts: tampered.tripArtifacts,
      }),
    ).toThrow(Ds4RpmRealDataScientificIntegrityError);
  });

  it('rejects missing mandatory scientific claim', () => {
    const report = minimalValidReport({
      unsupportedScientificClaims: ['NO_REAL_WORLD_ACCURACY_OR_CAUSALITY_CLAIM'],
    });
    const violations = validateDs4RpmRealDataResearchReportScientificIntegrityV1(report);
    expect(violations.some((v) => v.code === 'MISSING_UNSUPPORTED_CLAIM')).toBe(true);
    expect(() => assertDs4RpmRealDataResearchReportScientificIntegrityV1(report)).toThrow(
      Ds4RpmRealDataScientificIntegrityError,
    );
  });

  it('rejects wrong execution boundary', () => {
    const report = minimalValidReport({
      executionBoundary: 'OWNER_AUTHORIZED_PRODUCTION_READ_NOT_IMPLEMENTED',
    });
    expect(() => assertDs4RpmRealDataResearchReportScientificIntegrityV1(report)).toThrow(
      Ds4RpmRealDataScientificIntegrityError,
    );
  });
});
