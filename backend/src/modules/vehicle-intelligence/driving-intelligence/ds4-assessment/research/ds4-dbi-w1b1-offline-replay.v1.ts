/**
 * W1B1 offline replay — verified local fixtures only; no forged origins.
 */

import { computeDs4DbiW0MbfFromPayloadV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripKernelResultV1 } from './ds4-dbi-w0-mbf.types.v1';
import { projectDs4DbiW1cTripAssessmentFromW0KernelV1 } from './ds4-dbi-w1c-trip-assessment-projector.v1';
import type { Ds4DbiW1b1FixtureIdV1 } from './ds4-dbi-w1b1-fixture-registry.v1';
import {
  loadDs4DbiW1b1LocalEvidenceV1,
  type Ds4DbiW1b1LoadResultV1,
  type Ds4DbiW1b1VerificationReportV1,
} from './ds4-dbi-w1b1-local-evidence.loader.v1';

export const DS4_DBI_W1B1_OFFLINE_REPLAY_VERSION = 'ds4-dbi-w1b1-offline-replay-v1' as const;

export type Ds4DbiW1b1OfflineReplaySuccessV1 = {
  ok: true;
  replayVersion: typeof DS4_DBI_W1B1_OFFLINE_REPLAY_VERSION;
  verification: Ds4DbiW1b1VerificationReportV1;
  kernel: Ds4DbiW0TripKernelResultV1;
  w1c: ReturnType<typeof projectDs4DbiW1cTripAssessmentFromW0KernelV1>;
};

export type Ds4DbiW1b1OfflineReplayFailureV1 = {
  ok: false;
  replayVersion: typeof DS4_DBI_W1B1_OFFLINE_REPLAY_VERSION;
  load: Ds4DbiW1b1LoadResultV1 & { ok: false };
  kernel: null;
  w1c: null;
};

export type Ds4DbiW1b1OfflineReplayResultV1 = Ds4DbiW1b1OfflineReplaySuccessV1 | Ds4DbiW1b1OfflineReplayFailureV1;

export function runDs4DbiW1b1OfflineReplayV1(input: {
  fixtureId: Ds4DbiW1b1FixtureIdV1;
  repositoryRoot: string;
}): Ds4DbiW1b1OfflineReplayResultV1 {
  const load = loadDs4DbiW1b1LocalEvidenceV1({
    fixtureId: input.fixtureId,
    repositoryRoot: input.repositoryRoot,
  });

  if (!load.ok) {
    return {
      ok: false,
      replayVersion: DS4_DBI_W1B1_OFFLINE_REPLAY_VERSION,
      load,
      kernel: null,
      w1c: null,
    };
  }

  const evidenceOrigin = load.fixture.classification === 'SYNTHETIC' ? 'SYNTHETIC_CONTROL' : 'HISTORICAL_RESEARCH_RECORDING';

  const kernel = computeDs4DbiW0MbfFromPayloadV1({
    payload: load.payload,
    tripMeta: load.tripMeta,
    qualityTier: 'STRICT',
    expectedContentFingerprint: load.tripMeta.contentFingerprint,
    expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
    evidenceOrigin,
  });

  const w1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);

  return {
    ok: true,
    replayVersion: DS4_DBI_W1B1_OFFLINE_REPLAY_VERSION,
    verification: load.verification,
    kernel,
    w1c,
  };
}
