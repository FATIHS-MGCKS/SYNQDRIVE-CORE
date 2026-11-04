import type { Ds4RpmRealDataResearchReportV1 } from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_ALL_SCIENTIFIC_DISCLAIMER_CLAIMS } from './ds4-rpm-real-data-scientific-claims.v1';

export type Ds4RpmRealDataScientificIntegrityViolation = {
  code: string;
  detail: string;
};

export class Ds4RpmRealDataScientificIntegrityError extends Error {
  readonly code = 'DS4_RPM_REAL_DATA_SCIENTIFIC_INTEGRITY_VIOLATION' as const;

  constructor(
    readonly violations: readonly Ds4RpmRealDataScientificIntegrityViolation[],
  ) {
    super(
      `DS4 RPM real-data research report failed scientific integrity (${violations.length} violation(s))`,
    );
    this.name = 'Ds4RpmRealDataScientificIntegrityError';
  }
}

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

  for (const claim of DS4_RPM_REAL_DATA_ALL_SCIENTIFIC_DISCLAIMER_CLAIMS) {
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

/** Fail closed — never return a partially valid research report. */
export function assertDs4RpmRealDataResearchReportScientificIntegrityV1(
  report: Ds4RpmRealDataResearchReportV1,
): void {
  const violations = validateDs4RpmRealDataResearchReportScientificIntegrityV1(report);
  if (violations.length > 0) {
    throw new Ds4RpmRealDataScientificIntegrityError(violations);
  }
}

export function countShadowContextAvailableEvents(
  report: Ds4RpmRealDataResearchReportV1,
): number {
  return report.contextClassificationTotals.AVAILABLE ?? 0;
}
