import type {
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
} from './ds4-rpm-shadow-correlation-v1.contract';

export type Ds4RpmShadowCorrelationValidationResult =
  | { ok: true }
  | { ok: false; reasonCodes: Ds4RpmShadowCorrelationReasonCode[] };

export function validateDs4RpmShadowCorrelationInput(
  input: Ds4RpmShadowCorrelationInputV1,
  options?: {
    /** When supplied, fingerprint strings must match canonical recompute — not trusted alone. */
    recomputedV1bInputFingerprint?: string | null;
  },
): Ds4RpmShadowCorrelationValidationResult {
  const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = [];

  if (!input.motion.runId?.trim()) {
    reasonCodes.push('MOTION_RUN_BINDING_UNPROVEN');
  }

  if (!input.v1b) {
    reasonCodes.push('V1B_RUN_MISSING');
  } else {
    if (!input.v1b.runId?.trim()) {
      reasonCodes.push('V1B_RUN_BINDING_UNPROVEN');
    }
    if (
      input.v1b.summary.organizationId !== input.organizationId ||
      input.v1b.summary.vehicleId !== input.vehicleId ||
      input.v1b.summary.tripId !== input.tripId
    ) {
      reasonCodes.push('TENANCY_MISMATCH');
    }
    if (input.v1b.summary.tripId !== input.tripId) {
      reasonCodes.push('TRIP_ID_MISMATCH');
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
    if (
      options?.recomputedV1bInputFingerprint != null &&
      options.recomputedV1bInputFingerprint !== input.v1b.inputFingerprint
    ) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
  }

  if (!input.rpmSamples) {
    reasonCodes.push('RPM_SAMPLE_EVIDENCE_MISSING');
  } else {
    if (!input.rpmSamples.inputFingerprint?.trim()) {
      reasonCodes.push('RPM_SAMPLE_BINDING_UNPROVEN');
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
    if (
      options?.recomputedV1bInputFingerprint != null &&
      input.rpmSamples.inputFingerprint !== options.recomputedV1bInputFingerprint
    ) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
  }

  if (reasonCodes.length === 0) {
    return { ok: true };
  }
  return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
}
