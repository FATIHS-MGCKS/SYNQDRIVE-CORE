import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  resolveMotionCoreShadowEventRowContract,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';

export const DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2 =
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;

export type Ds4AssessmentDiscoveryTerminalReasonCode =
  | 'DISCOVERY_PAYLOAD_REQUIRED'
  | 'DISCOVERY_SOURCE_IDENTITY_MISMATCH'
  | 'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE'
  | 'DISCOVERY_SUMMARY_PAYLOAD_CONTRACT_MISMATCH';

export type Ds4MotionRunCollectionEligibilityResult =
  | { eligible: true }
  | {
      eligible: false;
      reasonCode: Extract<
        Ds4AssessmentDiscoveryTerminalReasonCode,
        'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE' | 'DISCOVERY_SUMMARY_PAYLOAD_CONTRACT_MISMATCH'
      >;
    };

function readSummaryEventRowContract(summaryJson: { eventRowContract?: unknown } | null | undefined): string | null {
  const raw = summaryJson?.eventRowContract;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return raw;
}

function readPayloadDeclaredEventRowContract(payload: DiV0MotionCoreShadowPayloadV1): string | null {
  const declared = payload?.contract?.persistence?.eventRowContract;
  if (declared === undefined || declared === null) return null;
  if (typeof declared !== 'string' || declared.trim().length === 0) return null;
  return declared;
}

/**
 * Fail-closed collection gate after SQL pre-filter: summary producer metadata must match decoded payload contract.
 */
export function evaluateDs4MotionRunCollectionEligibilityV1(input: {
  summaryJson: { eventRowContract?: unknown; [key: string]: unknown } | null | undefined;
  payload: DiV0MotionCoreShadowPayloadV1;
}): Ds4MotionRunCollectionEligibilityResult {
  const summaryContract = readSummaryEventRowContract(input.summaryJson);
  if (summaryContract !== DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2) {
    return { eligible: false, reasonCode: 'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE' };
  }

  const payloadDeclared = readPayloadDeclaredEventRowContract(input.payload);
  if (payloadDeclared !== summaryContract) {
    return { eligible: false, reasonCode: 'DISCOVERY_SUMMARY_PAYLOAD_CONTRACT_MISMATCH' };
  }

  const payloadResolved = resolveMotionCoreShadowEventRowContract(input.payload);
  if (payloadResolved !== DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY) {
    return { eligible: false, reasonCode: 'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE' };
  }

  return { eligible: true };
}
