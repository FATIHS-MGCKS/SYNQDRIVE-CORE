import { createHash } from 'node:crypto';

export type ApdsV3ShadowDecisionFingerprintInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  physicalRequestId: string;
  activationVersion: string;
  policyVersion: string;
  baselineCanonicalDue: boolean | null;
  baselineAuthority: string;
  baselineAssessable: boolean;
  v3Decision: string;
  v3Reason: string;
  expectedInformationGain: number | null;
  informationGainHeuristic: boolean;
  consumerDemandFailClosed: boolean;
  observationQuality: string | null;
  observationScope: string;
  missingEvidenceReasons: string[];
};

export function buildApdsV3ShadowDecisionFingerprint(
  input: ApdsV3ShadowDecisionFingerprintInput,
): string {
  const payload = JSON.stringify(input);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
