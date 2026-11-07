import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import { DS4_DBI_W0_HISTORICAL_FIXTURES_V1 } from '../ds4-dbi-w0-historical-replay.fixture-registry.v1';
import {
  loadDs4DbiW0HistoricalMotionFixtureV1,
  resolveHistoricalSpeedAuthorityBindingV1,
} from '../ds4-dbi-w0-historical-replay.loader.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

describe('ds4-dbi-w0-historical-replay.v1', () => {
  const tig22 = DS4_DBI_W0_HISTORICAL_FIXTURES_V1.TIG22;

  it('TIG22 payload file sha256 matches frozen registry and PROVENANCE_MANIFEST', () => {
    const abs = join(repoRoot, tig22.motionCoreShadowPayloadRelPath!);
    const sha = createHash('sha256').update(readFileSync(abs)).digest('hex');
    expect(sha).toBe(tig22.expectedPayloadContentSha256);
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, tig22.provenanceManifestRelPath), 'utf8'),
    ) as { file_hashes: Record<string, string> };
    expect(manifest.file_hashes['snapshots/di_v0_motion_core_shadow_payload.json']).toBe(sha);
  });

  it('STRICT binding fails speed authority when contract field omitted', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'STRICT',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.codes).toContain('SPEED_AUTHORITY_NOT_ATTESTED');
    }
  });

  it('RELAXED binding loads TIG22 and runs W0 kernel deterministically', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.speedAuthorityBinding.source).toBe('UNANIMOUS_C4_ESTIMATOR_WITH_RELAXED_POLICY');
    expect(loaded.tripMeta.tripId).toBe(tig22.tripId);
    expect(loaded.tripMeta.distanceKm).toBe(24);
    expect(loaded.tripMeta.exposureSecondsEs).toBeGreaterThan(0);

    const strict = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const relaxed = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'RELAXED',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });

    expect(strict.evidenceOrigin).toBe('HISTORICAL_RESEARCH_RECORDING');
    expect(strict.sealedRealC4StatisticalEligibility).toBe(false);
    expect(strict.independentScientificValidationStatus).toBe('NOT_EVALUATED');
    expect(strict.implementationWorks).toBe(true);

    expect(strict.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(strict.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
    expect(strict.d6StopStructure.status).toBe('KNOWN');
    expect(strict.d8Burstiness.status).toBe('ABSTAIN');
    expect(strict.d8Burstiness.reasonCodes).toContain('MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW');

    expect(relaxed.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(relaxed.d8Burstiness.status).toBe('ABSTAIN');

    const again = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    expect(again.d8Burstiness.indexOfDispersion).toBe(strict.d8Burstiness.indexOfDispersion);
    expect(again.d4SpeedVariabilityRobustCv.value).toBe(strict.d4SpeedVariabilityRobustCv.value);
  });

  it('TES16 has no motion payload bytes in repository', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TES16',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.codes).toContain('NO_MOTION_PAYLOAD_BYTES');
    }
  });

  it('resolveHistoricalSpeedAuthorityBindingV1 does not invent without policy', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!loaded.ok) {
      throw new Error('expected load ok');
    }
    const binding = resolveHistoricalSpeedAuthorityBindingV1({
      payload: loaded.payload,
      bindingTier: 'STRICT',
    });
    expect(binding.ok).toBe(false);
  });
});
