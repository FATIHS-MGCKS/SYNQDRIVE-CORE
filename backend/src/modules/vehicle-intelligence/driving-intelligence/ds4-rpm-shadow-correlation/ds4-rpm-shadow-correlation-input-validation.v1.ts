import type {
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
} from './ds4-rpm-shadow-correlation-v1.contract';

export type Ds4RpmShadowCorrelationValidationResult =
  | { ok: true }
  | { ok: false; reasonCodes: Ds4RpmShadowCorrelationReasonCode[] };

export function validateDs4RpmShadowCorrelationInput(
  input: Ds4RpmShadowCorrelationInputV1,
): Ds4RpmShadowCorrelationValidationResult {
  const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = [];

  if (!input.v1b) {
    reasonCodes.push('V1B_RUN_MISSING');
  } else {
    if (
      input.v1b.summary.organizationId !== input.organizationId ||
      input.v1b.summary.vehicleId !== input.vehicleId ||
      input.v1b.summary.tripId !== input.tripId
    ) {
      reasonCodes.push('TENANCY_MISMATCH');
    }
    if (input.v1b.summary.processingOutcome !== 'SUCCEEDED') {
      reasonCodes.push('V1B_NOT_SUCCEEDED');
    }
    if (!input.v1b.summary.admission.processingAllowed) {
      reasonCodes.push('V1B_ADMISSION_DENIED');
    }
    if (input.v1b.inputFingerprint !== input.v1b.summary.inputFingerprint) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
  }

  if (!input.rpmSamples) {
    reasonCodes.push('RPM_SAMPLE_EVIDENCE_MISSING');
  } else {
    if (input.rpmSamples.points.length === 0 && input.v1b?.summary.rpmValues.validPointCount === 0) {
      // allowed — missing HF path
    }
    if (
      input.v1b &&
      input.rpmSamples.providerSourceLinkId != null &&
      input.v1b.summary.providerSourceLinkId != null &&
      input.rpmSamples.providerSourceLinkId !== input.v1b.summary.providerSourceLinkId
    ) {
      reasonCodes.push('SOURCE_LINK_MISMATCH');
    }
    if (
      input.v1b &&
      input.rpmSamples.inputFingerprint !== input.v1b.inputFingerprint
    ) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
  }

  if (input.events.length === 0) {
    reasonCodes.push('MOTION_RUN_MISSING');
  }

  if (reasonCodes.length === 0) {
    return { ok: true };
  }
  return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
}
