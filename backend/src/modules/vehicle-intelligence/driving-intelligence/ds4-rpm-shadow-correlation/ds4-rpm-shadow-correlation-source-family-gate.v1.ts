import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type {
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationReasonCode,
  Ds4RpmShadowCorrelationRpmSampleEvidenceV1,
} from './ds4-rpm-shadow-correlation-v1.contract';

export function validateRpmSampleSourceFamilyAuthority(input: {
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  rpmSamples: Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null;
}): Ds4RpmShadowCorrelationReasonCode[] {
  const codes: Ds4RpmShadowCorrelationReasonCode[] = [];
  if (input.rpmSamples == null) {
    return codes;
  }

  const family = input.rpmSamples.telemetrySourceFamily ?? null;
  const attestation = input.rpmSamples.sourceFamilyAttestation ?? null;

  if (family != null && hasUncertainHistoricalObdRecordTime(family)) {
    codes.push('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
  }

  if (input.evidenceKind === 'REAL_OBSERVATION') {
    if (attestation !== 'PROVEN_FROM_DIMO_IDENTITY' || family == null) {
      codes.push('SOURCE_FAMILY_BINDING_UNPROVEN');
    }
    if (family != null && hasUncertainHistoricalObdRecordTime(family)) {
      codes.push('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
    }
  }

  return [...new Set(codes)];
}
