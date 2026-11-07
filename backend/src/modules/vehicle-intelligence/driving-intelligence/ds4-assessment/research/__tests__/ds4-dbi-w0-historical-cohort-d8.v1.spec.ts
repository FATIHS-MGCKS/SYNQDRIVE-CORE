import { join } from 'path';
import { readFileSync } from 'fs';
import { buildDs4DbiW0HistoricalCohortD8ReportV1 } from '../ds4-dbi-w0-historical-cohort-d8.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../ds4-dbi-w0-historical-replay.loader.v1';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import { buildDs4DbiW0MovingExposureClockEvidenceV1 } from '../ds4-dbi-w0-moving-exposure-clock.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

describe('ds4-dbi-w0-historical-cohort-d8.v1', () => {
  it('TIG22_V4 source verifies ddcf32cd and omits contract.speedAuthority', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22_V4',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.payloadFileSha256).toBe('ddcf32cd111ef21859e7df9f20915190efbe89aa416a22132e02c7d658712ccd');
    expect(loaded.payload.contract?.speedAuthority).toBeUndefined();
    expect(loaded.tripMeta.sourceMotionRunId).toBe('15cdc8ae-35b5-44a1-9c91-2cd9120d1546');
    expect(loaded.provenanceLimitations).toContain('RUN_META_CANONICAL_DIGEST_DIFFERS_FROM_FILE_SHA256');
  });

  it('canonical kernel never passes researchSpeedAuthorityPartitionOverride', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('load');
    }
    const kernelSource = readFileSync(
      join(__dirname, '../ds4-dbi-w0-mbf-kernel.v1.ts'),
      'utf8',
    );
    expect(kernelSource.includes('researchSpeedAuthorityPartitionOverride')).toBe(false);
    computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({
      payload: loaded.payload,
      suppliedExposureSecondsEs: loaded.tripMeta.exposureSecondsEs,
    });
    expect(clock.movingExposureSeconds).toBe(0);
  });

  it('cohort report compares TIG22 pre-FABLE vs V4 on same trip', () => {
    const report = buildDs4DbiW0HistoricalCohortD8ReportV1({
      fixtureIds: ['TIG22', 'TIG22_V4'],
      repositoryRoot: repoRoot,
    });
    expect(report.arms.length).toBe(2);
    const pre = report.arms.find((a) => a.fixtureId === 'TIG22')!;
    const v4 = report.arms.find((a) => a.fixtureId === 'TIG22_V4')!;
    expect(pre.payloadFileSha256).not.toBe(v4.payloadFileSha256);
    expect(pre.sourceMotionRunId).not.toBe(v4.sourceMotionRunId);
    expect(pre.eventsQualityOk).toBe(16);
    expect(v4.eventsQualityOk).toBe(16);
    expect(pre.canonical.d8).toBe('ABSTAIN');
    expect(v4.canonical.d8).toBe('ABSTAIN');
    expect(pre.researchAdaptedD8.admittedEventCount).toBe(15);
    expect(v4.researchAdaptedD8.admittedEventCount).toBe(13);
    expect(pre.researchAdaptedD8.nonEmptyWindowCount).toBe(9);
    expect(v4.researchAdaptedD8.nonEmptyWindowCount).toBe(9);
    expect(pre.researchAdaptedD8.reasonCodes).toContain('MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS');
    expect(report.comparisonNotes.some((n) => n.includes('TIG22_PRE_FABLE vs TIG22_V4'))).toBe(true);
    expect(['TIG22', 'TIG22_V4', 'NONE']).toContain(report.bestD8ValidationCandidate.fixtureId);
  });
});
