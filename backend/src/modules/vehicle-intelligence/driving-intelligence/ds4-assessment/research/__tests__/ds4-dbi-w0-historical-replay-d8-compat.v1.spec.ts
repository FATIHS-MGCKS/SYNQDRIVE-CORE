import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import { buildDs4DbiW0HistoricalD8CompatibilityReportV1 } from '../ds4-dbi-w0-historical-replay-d8-compat.v1';
import { DS4_DBI_W0_HISTORICAL_FIXTURES_V1 } from '../ds4-dbi-w0-historical-replay.fixture-registry.v1';
import {
  loadDs4DbiW0HistoricalMotionFixtureV1,
  resolveHistoricalSpeedAuthorityBindingV1,
} from '../ds4-dbi-w0-historical-replay.loader.v1';
import { buildDs4DbiW0MovingExposureClockEvidenceV1 } from '../ds4-dbi-w0-moving-exposure-clock.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

describe('ds4-dbi-w0-historical-replay-d8-compat.v1', () => {
  const tig22 = DS4_DBI_W0_HISTORICAL_FIXTURES_V1.TIG22;

  it('confirms root cause: missing contract.speedAuthority zeroes canonical B3 clock', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.payload.contract.speedAuthority).toBeUndefined();
    expect(loaded.tripMeta.exposureSecondsEs).toBeGreaterThan(1000);

    const canonicalClock = buildDs4DbiW0MovingExposureClockEvidenceV1({
      payload: loaded.payload,
      suppliedExposureSecondsEs: loaded.tripMeta.exposureSecondsEs,
    });
    expect(canonicalClock.derivable).toBe(false);
    expect(canonicalClock.movingExposureSeconds).toBe(0);
    expect(canonicalClock.dualTime.admittedEventCount).toBe(0);

    const adaptedClock = buildDs4DbiW0MovingExposureClockEvidenceV1({
      payload: loaded.payload,
      suppliedExposureSecondsEs: loaded.tripMeta.exposureSecondsEs,
      researchSpeedAuthorityPartitionOverride: 'C4_ONLY',
    });
    expect(adaptedClock.derivable).toBe(true);
    expect(adaptedClock.movingExposureSeconds).toBe(loaded.tripMeta.exposureSecondsEs);
    expect(adaptedClock.dualTime.admittedEventCount).toBeGreaterThanOrEqual(10);
  });

  it('canonical kernel D8 ABSTAIN; research-adapted D8 ABSTAIN on window gate (TIG22 pre-FABLE)', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load failed');
    }
    const payloadSha = createHash('sha256')
      .update(readFileSync(join(repoRoot, tig22.motionCoreShadowPayloadRelPath!), 'utf8'))
      .digest('hex');

    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: payloadSha,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
    expect(kernel.d8Burstiness.reasonCodes).toContain('MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW');
    expect(kernel.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');

    const report = buildDs4DbiW0HistoricalD8CompatibilityReportV1(loaded);
    expect(report.rootCause.payloadOmitsContractSpeedAuthority).toBe(true);
    expect(report.rootCause.confirmedFailurePath).toContain('MISSING_contract.speedAuthority');
    expect(report.canonical.d8.status).toBe('ABSTAIN');
    expect(report.researchAdapted.eligible).toBe(true);
    expect(report.researchAdapted.clock?.admittedEventCount).toBeGreaterThanOrEqual(10);
    expect(report.researchAdapted.d8?.status).toBe('ABSTAIN');
    expect(report.researchAdapted.d8?.reasonCodes).toContain('MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS');
    expect(report.researchAdapted.clock?.nonEmptyWindowCount).toBe(9);
    expect(report.researchAdapted.d8?.eventCount).toBe(15);
  });

  it('invalid estimator inference fails RELAXED binding', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load failed');
    }
    const tampered: DiV0MotionCoreShadowPayloadV1 = {
      ...loaded.payload,
      speeds: loaded.payload.speeds.map((row, i) =>
        i === 0 ? { ...row, estimator: 'NOT_C4_ESTIMATOR' } : row,
      ),
    };
    const binding = resolveHistoricalSpeedAuthorityBindingV1({
      payload: tampered,
      bindingTier: 'RELAXED',
    });
    expect(binding.ok).toBe(false);
  });

  it('payload file sha unchanged after compatibility diagnostics (no mutation)', () => {
    const abs = join(repoRoot, tig22.motionCoreShadowPayloadRelPath!);
    const before = createHash('sha256').update(readFileSync(abs)).digest('hex');
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load failed');
    }
    buildDs4DbiW0HistoricalD8CompatibilityReportV1(loaded);
    const after = createHash('sha256').update(readFileSync(abs)).digest('hex');
    expect(after).toBe(before);
    expect(after).toBe(tig22.expectedPayloadContentSha256);
  });
});
