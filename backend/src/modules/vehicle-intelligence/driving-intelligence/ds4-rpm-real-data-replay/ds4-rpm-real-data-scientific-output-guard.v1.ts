import type { Ds4RpmRealDataResearchReportV1 } from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from './ds4-rpm-real-data-replay-executor.v1';

export const DS4_RPM_REAL_DATA_SCIENTIFIC_OUTPUT_GUARD_CLAIMS = [
  'UNPROVEN_NEVER_IMPLIES_ELIGIBLE',
  'BLOCKED_AND_NOT_APPLICABLE_NOT_REAL_DATA_ELIGIBLE',
  'SHADOW_AVAILABLE_NOT_SOURCE_ELIGIBILITY',
  'SHADOW_AVAILABLE_NOT_REAL_WORLD_ACCURACY',
  'INJECTED_FIXTURE_SOURCE_NOT_PRODUCTION_ATTESTED',
  'CAN_SPEED_CO_BUCKET_NOT_CROSS_DOMAIN_TIMESTAMP_ALIGNMENT',
] as const;

export type Ds4RpmRealDataScientificIntegrityViolation = {
  code: string;
  detail: string;
};

export function validateDs4RpmRealDataResearchReportScientificIntegrityV1(
  report: Ds4RpmRealDataResearchReportV1,
): Ds4RpmRealDataScientificIntegrityViolation[] {
  const violations: Ds4RpmRealDataScientificIntegrityViolation[] = [];

  if (report.eligibilityCounts.eligible > 0) {
    violations.push({
      code: 'ELIGIBLE_COUNT_NONZERO_OFFLINE',
      detail: 'Real-data ELIGIBLE count must remain zero without owner-authorized attestation',
    });
  }

  for (const artifact of report.tripArtifacts) {
    if (artifact.eligibility.overallVerdict === 'ELIGIBLE') {
      violations.push({
        code: 'TRIP_MARKED_ELIGIBLE',
        detail: artifact.bundleId,
      });
    }
  }

  const requiredClaims = [
    ...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS,
    ...DS4_RPM_REAL_DATA_SCIENTIFIC_OUTPUT_GUARD_CLAIMS,
  ];
  for (const claim of requiredClaims) {
    if (!report.unsupportedScientificClaims.includes(claim)) {
      violations.push({ code: 'MISSING_UNSUPPORTED_CLAIM', detail: claim });
    }
  }

  if (report.executionBoundary !== 'OFFLINE_INJECTED_BUNDLE_ONLY') {
    violations.push({
      code: 'EXECUTION_BOUNDARY_NOT_OFFLINE',
      detail: report.executionBoundary,
    });
  }

  return violations;
}

/** Count shadow AVAILABLE events — distinct from source eligibility or field accuracy. */
export function countShadowContextAvailableEvents(
  report: Ds4RpmRealDataResearchReportV1,
): number {
  return report.contextClassificationTotals.AVAILABLE ?? 0;
}
