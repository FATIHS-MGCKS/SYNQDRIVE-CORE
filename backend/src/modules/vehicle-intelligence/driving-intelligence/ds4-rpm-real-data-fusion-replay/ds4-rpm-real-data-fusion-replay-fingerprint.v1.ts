import { createHash } from 'crypto';
import { stableStringify } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmRealDataFusionReplayArtifactV1 } from './ds4-rpm-real-data-fusion-replay.contract.v1';

export function computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(
  artifact: Ds4RpmRealDataFusionReplayArtifactV1,
): string {
  const material = {
    contractVersion: artifact.contractVersion,
    orchestratorVersion: artifact.orchestratorVersion,
    bundleId: artifact.bundleId,
    inputFingerprint: artifact.inputFingerprint,
    rpmInputFingerprint: artifact.rpmInputFingerprint,
    outcomeLabels: artifact.outcomeLabels,
    blockingReasons: artifact.blockingReasons,
    identity: artifact.identity,
    sourceAttestationVerdict: artifact.sourceAttestationVerdict,
    fusionStatus: artifact.fusionResult?.status ?? null,
    fusionTripReasonCodes: artifact.fusionResult?.tripReasonCodes ?? [],
    deterministicShadowSummary: artifact.shadowReplay.shadowTripReport
      ? {
          eventCount: artifact.shadowReplay.shadowTripReport.events.length,
          summary: artifact.shadowReplay.shadowTripReport.summary,
        }
      : null,
  };
  return createHash('sha256').update(stableStringify(material)).digest('hex');
}
