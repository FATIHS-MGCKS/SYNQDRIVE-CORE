import { createHash } from 'crypto';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  resolveMotionCoreShadowEventRowContract,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { DS4_ASSESSMENT_L2_RULE_BINDINGS_V1 } from './ds4-assessment-rule-bindings.v1';
import { DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT } from './ds4-assessment-quality-policy.v1';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from './ds4-trip-assessment-v1.contract';
import type { Ds4AssessmentDiscoveryTerminalReasonCode } from './ds4-assessment-motion-discovery-eligibility.v1';

export function computeDs4AssessmentInputFingerprint(input: {
  sourceMotionRunId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  eventRowContract: string | null;
  assessmentVersion?: string;
  qualityPolicyVersion?: string;
}): string {
  const payload = {
    assessmentVersion: input.assessmentVersion ?? DS4_TRIP_ASSESSMENT_VERSION_V1,
    qualityPolicyVersion: input.qualityPolicyVersion ?? DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT.policyVersion,
    assessmentL2RuleBindings: DS4_ASSESSMENT_L2_RULE_BINDINGS_V1,
    sourceMotionRunId: input.sourceMotionRunId,
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    contentFingerprint: input.contentFingerprint,
    eventRowContract: input.eventRowContract,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function computeDs4DiscoveryTerminalInputFingerprint(input: {
  sourceMotionRunId: string;
  assessmentVersion?: string;
  reasonCode: Ds4AssessmentDiscoveryTerminalReasonCode;
}): string {
  const payload = {
    kind: 'DS4_DISCOVERY_TERMINAL_V1',
    assessmentVersion: input.assessmentVersion ?? DS4_TRIP_ASSESSMENT_VERSION_V1,
    sourceMotionRunId: input.sourceMotionRunId,
    reasonCode: input.reasonCode,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function resolveCanonicalEventRowContractForDs4Assessment(
  payload: DiV0MotionCoreShadowPayloadV1,
): string | null {
  const contractResolution = resolveMotionCoreShadowEventRowContract(payload);
  if (contractResolution === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY) {
    return contractResolution;
  }
  if (contractResolution === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY) {
    return contractResolution;
  }
  return null;
}

export type Ds4MotionSourceFingerprintResult =
  | { ok: true; inputFingerprint: string; eventRowContract: string | null }
  | { ok: false; code: 'PAYLOAD_REQUIRED' | 'SOURCE_IDENTITY_MISMATCH' };

export function computeDs4AssessmentInputFingerprintFromMotionSource(input: {
  sourceMotionRunId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  summaryJson?: { contentFingerprint?: string | null; eventRowContract?: string | null } | null;
  payload: DiV0MotionCoreShadowPayloadV1 | null;
  assessmentVersion?: string;
  qualityPolicyVersion?: string;
}): Ds4MotionSourceFingerprintResult {
  if (!input.payload) {
    return { ok: false, code: 'PAYLOAD_REQUIRED' };
  }

  const payloadSummaryFp = (input.payload.summary as { contentFingerprint?: string } | undefined)?.contentFingerprint;
  const summaryFp = payloadSummaryFp ?? input.summaryJson?.contentFingerprint ?? null;
  if (summaryFp && summaryFp !== input.contentFingerprint) {
    return { ok: false, code: 'SOURCE_IDENTITY_MISMATCH' };
  }

  const eventRowContract = resolveCanonicalEventRowContractForDs4Assessment(input.payload);
  const summaryContract = input.summaryJson?.eventRowContract ?? null;
  if (summaryContract !== null && summaryContract !== eventRowContract) {
    return { ok: false, code: 'SOURCE_IDENTITY_MISMATCH' };
  }

  const inputFingerprint = computeDs4AssessmentInputFingerprint({
    sourceMotionRunId: input.sourceMotionRunId,
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    contentFingerprint: input.contentFingerprint,
    eventRowContract,
    assessmentVersion: input.assessmentVersion,
    qualityPolicyVersion: input.qualityPolicyVersion,
  });

  return { ok: true, inputFingerprint, eventRowContract };
}
