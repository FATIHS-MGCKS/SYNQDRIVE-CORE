import type { Ds4Layer2MotionPhysicsContextV1 } from './ds4-layer2-p3-motion-physics-context.v1.contract';
import type {
  Ds4Layer2P3cReferenceResolutionSourceV1,
  Ds4Layer2P3cTemporalProvenanceV1,
} from './ds4-layer2-p3c-physics-diagnostics.v1.contract';
import type { Ds4Layer2P3cTemporalReferenceEvidenceV1 } from './ds4-layer2-p3c-physics-diagnostics.v1.contract';

/**
 * Classifies historical vs retrospective reference provenance separately from P3B evidence tier
 * and numeric diagnostic availability.
 */
export function classifyDs4Layer2P3cTemporalProvenanceV1(input: {
  resolutionSource: Ds4Layer2P3cReferenceResolutionSourceV1 | null;
  referenceCreatedAtUtc: Date | null;
  tripStartUtc: Date;
  tripEndUtc: Date;
  temporalReferenceEvidence: Ds4Layer2P3cTemporalReferenceEvidenceV1;
  atTripEnd: Ds4Layer2MotionPhysicsContextV1 | null;
}): {
  temporalProvenance: Ds4Layer2P3cTemporalProvenanceV1;
  historicalEvidenceSupported: boolean;
} {
  if (input.atTripEnd == null || input.resolutionSource == null) {
    return { temporalProvenance: 'REFERENCE_UNAVAILABLE', historicalEvidenceSupported: false };
  }

  if (input.atTripEnd.applicability === 'IDENTITY_MISMATCH') {
    return { temporalProvenance: 'IDENTITY_MISMATCH', historicalEvidenceSupported: false };
  }

  if (
    input.temporalReferenceEvidence === 'REFERENCE_POSTDATES_TRIP' ||
    input.temporalReferenceEvidence === 'REFERENCE_EXPIRED_BEFORE_TRIP' ||
    input.temporalReferenceEvidence === 'TEMPORAL_AMBIGUOUS'
  ) {
    return { temporalProvenance: 'TEMPORAL_EVIDENCE_MISSING', historicalEvidenceSupported: false };
  }

  if (input.resolutionSource === 'FIXTURE_SNAPSHOT') {
    return { temporalProvenance: 'RETROSPECTIVE_REFERENCE', historicalEvidenceSupported: false };
  }

  if (input.resolutionSource === 'PERSISTED_ACTIVE_ONLY') {
    return { temporalProvenance: 'RETROSPECTIVE_REFERENCE', historicalEvidenceSupported: false };
  }

  if (input.resolutionSource === 'PERSISTED_POINT_IN_TIME') {
    const createdAt = input.referenceCreatedAtUtc;
    if (createdAt == null || createdAt.getTime() > input.tripEndUtc.getTime()) {
      return { temporalProvenance: 'TEMPORAL_EVIDENCE_MISSING', historicalEvidenceSupported: false };
    }
    if (
      input.atTripEnd.applicability === 'MISSING' ||
      input.atTripEnd.applicability === 'AMBIGUOUS' ||
      input.atTripEnd.applicability === 'NOT_ELIGIBLE'
    ) {
      return { temporalProvenance: 'REFERENCE_UNAVAILABLE', historicalEvidenceSupported: false };
    }
    return { temporalProvenance: 'HISTORICALLY_EVIDENCED', historicalEvidenceSupported: true };
  }

  return { temporalProvenance: 'TEMPORAL_EVIDENCE_MISSING', historicalEvidenceSupported: false };
}

export function provenanceLimitationReasons(input: {
  temporalProvenance: Ds4Layer2P3cTemporalProvenanceV1;
  historicalEvidenceSupported: boolean;
  referenceApplicability: Ds4Layer2MotionPhysicsContextV1['applicability'];
}): ('RETROSPECTIVE_REFERENCE_PROVENANCE' | 'HISTORICAL_APPLICABILITY_NOT_EVIDENCED' | 'CONFIRMED_UNVERIFIED_REFERENCE')[] {
  const out: ('RETROSPECTIVE_REFERENCE_PROVENANCE' | 'HISTORICAL_APPLICABILITY_NOT_EVIDENCED' | 'CONFIRMED_UNVERIFIED_REFERENCE')[] =
    [];

  if (input.temporalProvenance === 'RETROSPECTIVE_REFERENCE') {
    out.push('RETROSPECTIVE_REFERENCE_PROVENANCE');
    out.push('HISTORICAL_APPLICABILITY_NOT_EVIDENCED');
  }
  if (!input.historicalEvidenceSupported && input.temporalProvenance !== 'HISTORICALLY_EVIDENCED') {
    if (!out.includes('HISTORICAL_APPLICABILITY_NOT_EVIDENCED')) {
      out.push('HISTORICAL_APPLICABILITY_NOT_EVIDENCED');
    }
  }
  if (input.referenceApplicability === 'AVAILABLE_CONFIRMED_UNVERIFIED') {
    out.push('CONFIRMED_UNVERIFIED_REFERENCE');
  }

  return out;
}
