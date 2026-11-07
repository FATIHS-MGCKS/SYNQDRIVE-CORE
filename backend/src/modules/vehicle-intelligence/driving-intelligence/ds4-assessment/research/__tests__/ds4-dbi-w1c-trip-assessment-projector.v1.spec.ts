import { createHash } from 'crypto';
import { join } from 'path';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripKernelResultV1 } from '../ds4-dbi-w0-mbf.types.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../ds4-dbi-w0-historical-replay.loader.v1';
import {
  deriveDs4DbiW1cTripOutcomeV1,
  projectDs4DbiW1cTripAssessmentFromW0KernelV1,
} from '../ds4-dbi-w1c-trip-assessment-projector.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

function stubKernel(overrides: Partial<Ds4DbiW0TripKernelResultV1> = {}): Ds4DbiW0TripKernelResultV1 {
  const known = { status: 'KNOWN' as const, value: 1, n: 10, coverage: 0.9, reasonCodes: ['MBF_W0_OK' as const] };
  const abstain = { status: 'ABSTAIN' as const, value: null, n: null, coverage: null, reasonCodes: ['MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS' as const] };
  const notAvail = {
    status: 'NOT_AVAILABLE' as const,
    directStopCount: null,
    stopsPerKm: null,
    medianMovingRunDurationSeconds: null,
    sustainedMovementShare: null,
    movingRunSplitReasonSample: [],
    reasonCodes: ['MBF_W0_NOT_EVALUABLE_NO_TRIP_META' as const],
  };
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
    d6StopStructure: { ...notAvail, status: 'KNOWN', directStopCount: 3, stopsPerKm: 0.1, reasonCodes: ['MBF_W0_OK'] },
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
  it('outcome matrix', () => {
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
        tripFailClosed: false,
        metricEligibility: ['KNOWN', 'NOT_AVAILABLE', 'NOT_AVAILABLE', 'NOT_AVAILABLE'],
      }),
    ).toBe('PARTIAL');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: false,
        metricEligibility: ['ABSTAIN', 'ABSTAIN', 'ABSTAIN', 'ABSTAIN'],
      }),
    ).toBe('NOT_EVALUABLE');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: false,
        metricEligibility: ['NOT_AVAILABLE', 'NOT_AVAILABLE', 'NOT_AVAILABLE', 'NOT_AVAILABLE'],
      }),
    ).toBe('NOT_EVALUABLE');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: true,
        metricEligibility: ['KNOWN', 'KNOWN', 'KNOWN', 'KNOWN'],
      }),
    ).toBe('NOT_EVALUABLE');
    expect(
      deriveDs4DbiW1cTripOutcomeV1({
        tripFailClosed: true,
        metricEligibility: ['KNOWN', 'ABSTAIN', 'ABSTAIN', 'ABSTAIN'],
      }),
    ).toBe('NOT_EVALUABLE');
  });

  it('fail-closed blocks displayed values', () => {
    const kernel = stubKernel({
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
    });
    const s = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(s.tripOutcome).toBe('NOT_EVALUABLE');
    expect(s.sourceIntegrityStatus).toBe('FAIL_CLOSED');
    expect(s.metrics.every((m) => m.value === null)).toBe(true);
    expect(s.metrics.every((m) => m.eligibilityStatus === 'BLOCKED_FAIL_CLOSED')).toBe(true);
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
    const summary = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(summary.tripOutcome).toBe('PARTIAL');
    expect(summary.knownMetricCount).toBe(3);
    expect(summary.metrics.find((m) => m.metricId === 'D8')?.eligibilityStatus).toBe('ABSTAIN');
    expect(kernel.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(summary.sealedRealC4StatisticalEligibility).toBe(false);
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
    expect(canonicalPayloadFingerprint).not.toBe(loaded.payloadFileSha256);
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: canonicalPayloadFingerprint,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const summary = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(summary.tripOutcome).toBe('PARTIAL');
    expect(summary.sourceIntegrityStatus).toBe('OK');
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
  });
});
