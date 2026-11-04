import type {
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
} from './ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmShadowCorrelationValidationResult } from './ds4-rpm-shadow-correlation-input-validation.v1';
import { validateDs4RpmShadowCorrelationInput } from './ds4-rpm-shadow-correlation-input-validation.v1';

export type Ds4RpmShadowCorrelationProvenanceGateV1 = {
  recomputedV1bInputFingerprint: string;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  /** When set, sample points must match canonical trip input byte-for-byte (fixture integrity). */
  canonicalTripRpmPoints?: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
};

function rpmPointsEqual(
  a: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
  b: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.recordedAtIso !== b[i]!.recordedAtIso || a[i]!.valueRpm !== b[i]!.valueRpm) {
      return false;
    }
  }
  return true;
}

export function validateDs4RpmShadowCorrelationProvenanceGate(
  input: Ds4RpmShadowCorrelationInputV1,
  gate: Ds4RpmShadowCorrelationProvenanceGateV1,
): Ds4RpmShadowCorrelationValidationResult {
  const reasonCodes: Ds4RpmShadowCorrelationReasonCode[] = [];

  const base = validateDs4RpmShadowCorrelationInput(input, {
    recomputedV1bInputFingerprint: gate.recomputedV1bInputFingerprint,
  });
  if (!base.ok) {
    reasonCodes.push(...base.reasonCodes);
  }

  if (gate.evidenceKind === 'REAL_OBSERVATION') {
    reasonCodes.push('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
  }

  if (gate.evidenceKind === 'SYNTHETIC_FIXTURE' && input.rpmSamples != null) {
    if (
      input.rpmSamples.source !== 'PINNED_FIXTURE' &&
      input.rpmSamples.source !== 'V1A_TRIP_INPUT'
    ) {
      reasonCodes.push('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
    }
  }

  if (input.v1b) {
    if (input.v1b.inputFingerprint !== gate.recomputedV1bInputFingerprint) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
    if (input.v1b.summary.inputFingerprint !== gate.recomputedV1bInputFingerprint) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
    if (input.v1b.inputFingerprint !== input.v1b.summary.inputFingerprint) {
      reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
  }

  if (input.rpmSamples && input.rpmSamples.inputFingerprint !== gate.recomputedV1bInputFingerprint) {
    reasonCodes.push('RPM_SAMPLE_FINGERPRINT_MISMATCH');
  }

  if (
    gate.canonicalTripRpmPoints != null &&
    input.rpmSamples != null &&
    !rpmPointsEqual(input.rpmSamples.points, gate.canonicalTripRpmPoints)
  ) {
    reasonCodes.push('RPM_SAMPLE_POINTS_DIGEST_MISMATCH');
  }

  if (
    input.rpmSamples != null &&
    (input.rpmSamples.providerSourceLinkId == null ||
      input.rpmSamples.providerSourceLinkId.trim() === '')
  ) {
    reasonCodes.push('SOURCE_LINK_BINDING_UNPROVEN');
  }

  if (reasonCodes.length === 0) {
    return { ok: true };
  }
  return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
}
