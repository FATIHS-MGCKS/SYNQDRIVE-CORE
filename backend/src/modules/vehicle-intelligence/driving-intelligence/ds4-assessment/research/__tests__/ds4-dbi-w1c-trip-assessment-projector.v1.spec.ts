import { createHash } from 'crypto';
import { join } from 'path';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripKernelResultV1 } from '../ds4-dbi-w0-mbf.types.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../ds4-dbi-w0-historical-replay.loader.v1';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from '../ds4-dbi-w0-sealed-real-attestation.v1';
import {
  deriveDs4DbiW1cTripOutcomeV1,
  projectDs4DbiW1cTripAssessmentFromW0KernelV1,
} from '../ds4-dbi-w1c-trip-assessment-projector.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

function stubKernel(overrides: Partial<Ds4DbiW0TripKernelResultV1> = {}): Ds4DbiW0TripKernelResultV1 {
  const known = { status: 'KNOWN' as const, value: 1, n: 10, coverage: 0.9, reasonCodes: ['MBF_W0_OK' as const] };
  const d8 = {
    status: 'ABSTAIN' as const,
    indexOfDispersion: null,
    shareNextEventWithin30s: null,
    windowCount: null,
    nonEmptyWindowCount: null,
    emptyWindowCount: null,
    totalWindowSlots: null,
    eventCount: null,
    observationWindowStartMsUtc: null,
    observationWindowEndMsUtc: null,
    observationWindowDurationSeconds: null,
    finalBinWidthExposureSeconds: null,
    reasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS' as const],
  };
  return {
    contractVersion: 'ds4-dbi-w0-mbf-kernel-v1',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
    implementationWorks: true,
    sealedRealC4StatisticalEligibility: false,
    independentScientificValidationStatus: 'NOT_EVALUATED',
    tripId: 'trip',
    sourceMotionRunId: 'run',
    qualityTier: 'STRICT',
    speedAuthority: 'C4_ONLY',
    shadowBundleVersion: 'B',
    contentFingerprintExpected: null,
    contentFingerprintObserved: null,
    sealedReferenceContentFingerprintSha256: null,
    exposureSecondsEs: 100,
    distanceKm: 10,
    coverageDiagnostics: {
      speedLabelsAdmissibleTier: 0,
      speedTimeSpanSeconds: null,
      consecutiveOneSecondPairsInSeries: 0,
      movingDirectLabelSecondsEstimated: 0,
      d4EligibleMovingDirectLabels: null,
      d5EligibleConsecutiveMovingDirectPairs: null,
    },
    d4SpeedVariabilityRobustCv: known,
    d5SpeedRoughnessMeanAbsDeltaKmhPerS: known,
    d6StopStructure: {
      status: 'KNOWN',
      directStopCount: 3,
      stopsPerKm: 0.1,
      medianMovingRunDurationSeconds: 120,
      sustainedMovementShare: 0.5,
      movingRunSplitReasonSample: [],
      reasonCodes: ['MBF_W0_OK'],
    },
    d8Burstiness: d8,
    dualTimeDomain: null,
    d8SelectionCalibrationResearch: null,
    diagnostics: {
      speedRowCount: 0,
      fsmRowCount: 0,
      movingDirectLabelCount: 0,
      consecutiveOneSecondPairCount: 0,
      directStopEpisodeCount: 0,
      eventCount: 0,
      repairedSpeedLabelCount: 0,
      inputValidationReasons: [],
      failClosedReasons: [],
    },
    ...overrides,
  };
}

describe('ds4-dbi-w1c-trip-assessment-projector.v1', () => {
  it('F04 trust gate remains hard-false', () => {
    expect(DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1).toBe(false);
  });

  it('outcome matrix unchanged', () => {
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: false,
        metricEligibility: ['KNOWN', 'KNOWN', 'KNOWN', 'KNOWN'],
      }),
    ).toBe('COMPLETE');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: false,
        metricEligibility: ['KNOWN', 'KNOWN', 'KNOWN', 'ABSTAIN'],
      }),
    ).toBe('PARTIAL');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: true,
        metricEligibility: ['KNOWN', 'KNOWN', 'KNOWN', 'KNOWN'],
      }),
    ).toBe('NOT_EVALUABLE');
  });

  it('PARTIAL preserves KNOWN metrics while D8 ABSTAIN', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(stubKernel());
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    const s = projected.summary;
    expect(s.tripOutcome).toBe('PARTIAL');
    expect(s.metrics.find((m) => m.metricId === 'D4')?.value).not.toBeNull();
    expect(s.metrics.find((m) => m.metricId === 'D8')?.eligibilityStatus).toBe('ABSTAIN');
    expect(s.sourceAuthenticationStatus).toBe('NOT_AUTHENTICATED');
    expect(s.kernelInputValidationStatus).toBe('OK');
  });

  it('D6 exposes multidimensional evidence without misleading coverage unit', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(stubKernel());
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    const d6 = projected.summary.metrics.find((m) => m.metricId === 'D6')!;
    expect(d6.unit).toBeNull();
    expect(d6.coverage).toBeNull();
    expect(d6.d6Multidimensional?.directStopCount).toBe(3);
    expect(d6.d6Multidimensional?.stopsPerKm).toBe(0.1);
  });

  it('D8 window evidence uses slot counts not coverage fraction', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(stubKernel());
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    const d8 = projected.summary.metrics.find((m) => m.metricId === 'D8')!;
    expect(d8.coverage).toBeNull();
    expect(d8.d8WindowEvidence).not.toBeNull();
  });

  it('fail-closed blocks displayed values', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(
      stubKernel({
        diagnostics: {
          speedRowCount: 0,
          fsmRowCount: 0,
          movingDirectLabelCount: 0,
          consecutiveOneSecondPairCount: 0,
          directStopEpisodeCount: 0,
          eventCount: 0,
          repairedSpeedLabelCount: 0,
          inputValidationReasons: [],
          failClosedReasons: ['MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH'],
        },
      }),
    );
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    const s = projected.summary;
    expect(s.tripOutcome).toBe('NOT_EVALUABLE');
    expect(s.sourceIntegrityStatus).toBe('FAIL_CLOSED');
    expect(s.metrics.every((m) => m.value === null)).toBe(true);
  });

  it('rejects invalid fail-closed reason codes', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(
      stubKernel({
        diagnostics: {
          speedRowCount: 0,
          fsmRowCount: 0,
          movingDirectLabelCount: 0,
          consecutiveOneSecondPairCount: 0,
          directStopEpisodeCount: 0,
          eventCount: 0,
          repairedSpeedLabelCount: 0,
          inputValidationReasons: [],
          failClosedReasons: ['NOT_A_REAL_FAIL_CLOSED_CODE' as 'MBF_W0_OK'],
        },
      }),
    );
    expect(projected.ok).toBe(false);
  });

  it('rejects unknown metric status', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(
      stubKernel({
        d4SpeedVariabilityRobustCv: {
          status: 'BOGUS' as 'KNOWN',
          value: 1,
          n: 1,
          coverage: 1,
          reasonCodes: ['MBF_W0_OK'],
        },
      }),
    );
    expect(projected.ok).toBe(false);
    if (!projected.ok) {
      expect(projected.codes).toContain('UNKNOWN_KERNEL_METRIC_STATUS');
    }
  });

  it('rejects KNOWN with non-finite value', () => {
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(
      stubKernel({
        d5SpeedRoughnessMeanAbsDeltaKmhPerS: {
          status: 'KNOWN',
          value: null,
          n: 10,
          coverage: 0.9,
          reasonCodes: ['MBF_W0_OK'],
        },
      }),
    );
    expect(projected.ok).toBe(false);
    if (!projected.ok) {
      expect(projected.codes).toContain('KNOWN_METRIC_VALUE_INCONSISTENT');
    }
  });

  it('TIG22 canonical kernel yields PARTIAL', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load');
    }
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    expect(projected.summary.tripOutcome).toBe('PARTIAL');
    expect(projected.summary.knownMetricCount).toBe(3);
    expect(kernel.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
  });

  it('TIG22_V4 canonical kernel yields PARTIAL', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22_V4',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load');
    }
    const canonicalPayloadFingerprint = createHash('sha256')
      .update(JSON.stringify(loaded.payload))
      .digest('hex');
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: canonicalPayloadFingerprint,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }
    expect(projected.summary.tripOutcome).toBe('PARTIAL');
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
  });
});
