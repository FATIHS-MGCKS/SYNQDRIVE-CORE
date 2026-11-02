import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { routeDs4RpmHfV1bFromV1aAdmission } from './ds4-rpm-hf-v1b-admission-routing';
import {
  buildV1bResultFromV1aInput,
  type Ds4RpmHfV1bShadowResultV1,
} from './ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bInputFingerprint } from './ds4-rpm-hf-v1b-input-fingerprint';
import { computeDs4RpmHfV1bTemporalAnalysis } from './ds4-rpm-hf-v1b-temporal.engine';
import { DS4_RPM_HF_V1B_TUNING } from './ds4-rpm-hf-v1b.config';

export type ProcessDs4RpmHfV1bShadowTripResult =
  | {
      kind: 'SUCCEEDED';
      fingerprint: string;
      result: Ds4RpmHfV1bShadowResultV1;
      persistStatus: 'SUCCEEDED';
    }
  | {
      kind: 'DEFER';
      fingerprint: string;
      deferReasonCode: string;
      result: Ds4RpmHfV1bShadowResultV1 | null;
    }
  | {
      kind: 'TERMINAL';
      fingerprint: string;
      rejectionReasonCode: string;
      persistStatus: 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED';
      result: Ds4RpmHfV1bShadowResultV1 | null;
    }
  | { kind: 'IDEMPOTENT'; fingerprint: string };

/**
 * Pure post-trip V1B processor — consumes V1A trip input only (no parallel RPM pipeline).
 */
export function processDs4RpmHfV1bShadowTrip(input: {
  tripInput: Ds4RpmHfV1aTripInputV1;
  attemptCount: number;
  computedAt: Date;
  existingSucceededFingerprint: string | null;
}): ProcessDs4RpmHfV1bShadowTripResult {
  const fingerprint = computeDs4RpmHfV1bInputFingerprint(input.tripInput);
  if (input.existingSucceededFingerprint === fingerprint) {
    return { kind: 'IDEMPOTENT', fingerprint };
  }

  const routing = routeDs4RpmHfV1bFromV1aAdmission(input.tripInput, input.attemptCount, {
    maxDeferAttempts: DS4_RPM_HF_V1B_TUNING.maxDeferAttempts,
    nowMs: input.computedAt.getTime(),
    postTripReadinessWindowMs: DS4_RPM_HF_V1B_TUNING.postTripReadinessWindowMs,
  });

  const temporal = computeDs4RpmHfV1bTemporalAnalysis({
    tripStartIso: input.tripInput.tripStartIso,
    tripEndIso: input.tripInput.tripEndIso,
    points: input.tripInput.rpmPoints,
    invalidValueCount: input.tripInput.dataQuality.invalidValueCount,
    duplicateTimestampCount: input.tripInput.dataQuality.duplicateTimestampCount,
  });

  const result = buildV1bResultFromV1aInput({
    tripInput: input.tripInput,
    temporal,
    processingOutcome: routing.outcome,
    deferReasonCode: routing.deferReasonCode,
    rejectionReasonCode: routing.rejectionReasonCode,
    inputFingerprint: fingerprint,
    computedAt: input.computedAt,
  });

  if (routing.outcome === 'DEFER_RETRY') {
    return {
      kind: 'DEFER',
      fingerprint,
      deferReasonCode: routing.deferReasonCode ?? 'DEFER',
      result: null,
    };
  }

  if (routing.outcome === 'SUCCEEDED' && routing.shouldPersistAnalysis) {
    return {
      kind: 'SUCCEEDED',
      fingerprint,
      result,
      persistStatus: 'SUCCEEDED',
    };
  }

  return {
    kind: 'TERMINAL',
    fingerprint,
    rejectionReasonCode: routing.rejectionReasonCode ?? 'INELIGIBLE',
    persistStatus: routing.outcome === 'TERMINAL_FAILED' ? 'TERMINAL_FAILED' : 'TERMINAL_INELIGIBLE',
    result: routing.shouldPersistAnalysis ? result : null,
  };
}
