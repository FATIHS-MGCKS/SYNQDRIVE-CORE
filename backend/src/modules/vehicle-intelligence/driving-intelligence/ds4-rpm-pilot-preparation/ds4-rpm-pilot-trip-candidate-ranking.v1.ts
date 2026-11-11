import type { Ds4RpmRealDataReferenceCohortVehicleLabel } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-eligibility.contract.v1';
import { classifyDs4RpmPilotScientificPlanningV1 } from './ds4-rpm-pilot-scientific-planning.v1';
import type {
  Ds4RpmPilotPreparationTargetCohortV1,
  Ds4RpmPilotRankedTripCandidateV1,
  Ds4RpmPilotTripCandidateDescriptorV1,
} from './ds4-rpm-pilot-preparation.contract.v1';

const ACTIVE_COHORTS: ReadonlySet<Ds4RpmPilotPreparationTargetCohortV1> = new Set(['AUDI_A4', 'VW_TIGUAN']);
const EXCLUDED_COHORTS: ReadonlySet<Ds4RpmRealDataReferenceCohortVehicleLabel> = new Set([
  'VW_ARTEON',
  'TESLA_MODEL_3',
]);

export function assertPilotCohortInScope(
  cohort: Ds4RpmRealDataReferenceCohortVehicleLabel,
): cohort is Ds4RpmPilotPreparationTargetCohortV1 {
  if (EXCLUDED_COHORTS.has(cohort)) {
    return false;
  }
  return ACTIVE_COHORTS.has(cohort as Ds4RpmPilotPreparationTargetCohortV1);
}

function abstain(reasons: string[]): Ds4RpmPilotRankedTripCandidateV1[] {
  return [
    {
      rank: 0,
      candidate: {
        candidateTripId: 'ABSTAIN',
        cohortVehicleLabel: 'AUDI_A4',
        organizationId: null,
        vehicleId: null,
        providerSourceLinkId: null,
        v1bAdmissionSucceeded: false,
        v1bInputFingerprintPresent: false,
        motionRunPresent: false,
        ds4AccelDecelEventCount: 0,
        rpmPointCount: 0,
        duplicateTimestampCount: 0,
        conflictingRpmValueCount: 0,
        estimatedMissingRpmBuckets: 0,
        vsiCadenceTier: null,
        telemetrySourceFamily: null,
        sourceFamilyAttestation: 'UNKNOWN',
      },
      selectionScore: -1,
      planningClassifications: [],
      tripSelected: false,
      abstainReasons: reasons,
    },
  ];
}

function scoreCandidate(c: Ds4RpmPilotTripCandidateDescriptorV1): number {
  if (c.organizationId == null || c.vehicleId == null || c.providerSourceLinkId == null) {
    return -1;
  }
  if (!c.v1bInputFingerprintPresent || !c.v1bAdmissionSucceeded) {
    return -1;
  }
  if (!c.motionRunPresent) {
    return -1;
  }
  let score = 0;
  score += c.ds4AccelDecelEventCount * 10;
  score += Math.min(c.rpmPointCount, 500);
  score -= c.duplicateTimestampCount * 50;
  score -= c.conflictingRpmValueCount * 100;
  score -= c.estimatedMissingRpmBuckets * 5;
  if (c.vsiCadenceTier === 'RPM_1S') score += 30;
  if (c.vsiCadenceTier === 'RPM_2S') score += 20;
  if (c.vsiCadenceTier === 'RPM_3S') score += 5;
  if (c.sourceFamilyAttestation === 'PROVEN') score += 15;
  return score;
}

/**
 * Deterministic offline ranking — does not select a trip as authoritative.
 * Tie-breaker: higher score, then lexicographic candidateTripId.
 */
export function rankDs4RpmPilotTripCandidatesV1(
  candidates: readonly Ds4RpmPilotTripCandidateDescriptorV1[],
): Ds4RpmPilotRankedTripCandidateV1[] {
  const scoped = candidates.filter((c) => assertPilotCohortInScope(c.cohortVehicleLabel));
  if (scoped.length === 0) {
    return abstain(['NO_IN_SCOPE_CANDIDATES']);
  }

  const missingIdentity = scoped.some(
    (c) => c.organizationId == null || c.vehicleId == null || c.providerSourceLinkId == null,
  );
  if (missingIdentity) {
    return abstain(['MISSING_TENANT_OR_SOURCE_LINK_BINDING']);
  }

  const scored = scoped
    .map((candidate) => {
      const selectionScore = scoreCandidate(candidate);
      const planningClassifications = classifyDs4RpmPilotScientificPlanningV1({
        telemetrySourceFamily: candidate.telemetrySourceFamily,
        sourceFamilyAttestation: candidate.sourceFamilyAttestation,
        v1bAdmissionSucceeded: candidate.v1bAdmissionSucceeded,
        motionRunPresent: candidate.motionRunPresent,
        rpmPointCount: candidate.rpmPointCount,
        authorizedRealObservation: false,
      });
      const abstainReasons: string[] = [];
      if (selectionScore < 0) {
        if (!candidate.motionRunPresent) abstainReasons.push('MISSING_MOTION_RUN');
        if (!candidate.v1bInputFingerprintPresent) abstainReasons.push('MISSING_V1B_INPUT_FINGERPRINT');
        if (!candidate.v1bAdmissionSucceeded) abstainReasons.push('V1B_ADMISSION_NOT_SUCCEEDED');
      }
      return {
        candidate,
        selectionScore,
        planningClassifications,
        abstainReasons,
      };
    })
    .filter((row) => row.selectionScore >= 0)
    .sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      return a.candidate.candidateTripId.localeCompare(b.candidate.candidateTripId);
    });

  if (scored.length === 0) {
    return abstain(['NO_DEFENSIBLE_CANDIDATES_AFTER_GATES']);
  }

  return scored.map((row, index) => ({
    rank: index + 1,
    candidate: row.candidate,
    selectionScore: row.selectionScore,
    planningClassifications: row.planningClassifications,
    tripSelected: false,
    abstainReasons: row.abstainReasons,
  }));
}
