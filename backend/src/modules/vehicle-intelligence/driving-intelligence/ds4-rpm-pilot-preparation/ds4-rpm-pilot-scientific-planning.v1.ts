import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmPilotScientificPlanningClassificationV1 } from './ds4-rpm-pilot-preparation.contract.v1';

export function classifyDs4RpmPilotScientificPlanningV1(input: {
  telemetrySourceFamily: TelemetrySourceFamily | null;
  sourceFamilyAttestation: 'PROVEN' | 'UNPROVEN' | 'UNKNOWN';
  v1bAdmissionSucceeded: boolean;
  motionRunPresent: boolean;
  rpmPointCount: number;
  authorizedRealObservation: boolean;
  dataQualityAssessmentEvidencePresent: boolean;
}): Ds4RpmPilotScientificPlanningClassificationV1[] {
  const classes: Ds4RpmPilotScientificPlanningClassificationV1[] = [];

  if (!input.authorizedRealObservation) {
    classes.push('REAL_OBSERVATION_NOT_AUTHORIZED');
  }

  const family = input.telemetrySourceFamily;
  if (family == null || family === 'UNKNOWN' || input.sourceFamilyAttestation !== 'PROVEN') {
    classes.push('TEMPORAL_FUSION_UNVERIFIED');
  } else if (hasUncertainHistoricalObdRecordTime(family)) {
    classes.push('TEMPORAL_FUSION_BLOCKED_R1');
    if (input.rpmPointCount > 0 || input.v1bAdmissionSucceeded) {
      classes.push('RPM_ONLY_DESCRIPTIVE');
    }
    if (input.motionRunPresent) {
      classes.push('DS4_ONLY_DESCRIPTIVE');
    }
    if (input.dataQualityAssessmentEvidencePresent) {
      classes.push('DATA_QUALITY_ASSESSED');
    }
    return [...new Set(classes)];
  }

  if (input.rpmPointCount > 0 || input.v1bAdmissionSucceeded) {
    classes.push('RPM_ONLY_DESCRIPTIVE');
  }
  if (input.motionRunPresent) {
    classes.push('DS4_ONLY_DESCRIPTIVE');
  }
  if (input.dataQualityAssessmentEvidencePresent) {
    classes.push('DATA_QUALITY_ASSESSED');
  }

  if (
    family === 'API_SYNTHETIC' ||
    (family != null && !hasUncertainHistoricalObdRecordTime(family))
  ) {
    classes.push('TEMPORAL_FUSION_UNVERIFIED');
  }

  return [...new Set(classes)];
}
