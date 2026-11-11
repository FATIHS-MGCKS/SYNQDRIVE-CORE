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

function cohortEmptyAbstain(
  cohortContext: Ds4RpmPilotPreparationTargetCohortV1,
  reasons: readonly string[],
): Ds4RpmPilotRankedTripCandidateV1[] {
  return [
    {
      rank: 0,
      candidate: {
        candidateTripId: 'COHORT_EMPTY',
        cohortVehicleLabel: cohortContext,
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
        dataQualityAssessmentEvidencePresent: false,
      },
      selectionScore: -1,
      planningClassifications: [],
      tripSelected: false,
      abstainReasons: [...reasons],
    },
  ];
}

function candidateAbstainRow(
  candidate: Ds4RpmPilotTripCandidateDescriptorV1,
  reasons: readonly string[],
): Ds4RpmPilotRankedTripCandidateV1 {
  return {
    rank: 0,
    candidate,
    selectionScore: -1,
    planningClassifications: classifyDs4RpmPilotScientificPlanningV1({
      telemetrySourceFamily: candidate.telemetrySourceFamily,
      sourceFamilyAttestation: candidate.sourceFamilyAttestation,
      v1bAdmissionSucceeded: candidate.v1bAdmissionSucceeded,
      motionRunPresent: candidate.motionRunPresent,
      rpmPointCount: candidate.rpmPointCount,
      authorizedRealObservation: false,
      dataQualityAssessmentEvidencePresent: candidate.dataQualityAssessmentEvidencePresent,
    }),
    tripSelected: false,
    abstainReasons: [...reasons],
  };
}

function identityMissing(candidate: Ds4RpmPilotTripCandidateDescriptorV1): boolean {
  return (
    candidate.organizationId == null ||
    candidate.vehicleId == null ||
    candidate.providerSourceLinkId == null
  );
}

function gateReasons(candidate: Ds4RpmPilotTripCandidateDescriptorV1, selectionScore: number): string[] {
  const reasons: string[] = [];
  if (identityMissing(candidate)) {
    reasons.push('MISSING_TENANT_OR_SOURCE_LINK_BINDING');
    return reasons;
  }
  if (selectionScore < 0) {
    if (!candidate.motionRunPresent) reasons.push('MISSING_MOTION_RUN');
    if (!candidate.v1bInputFingerprintPresent) reasons.push('MISSING_V1B_INPUT_FINGERPRINT');
    if (!candidate.v1bAdmissionSucceeded) reasons.push('V1B_ADMISSION_NOT_SUCCEEDED');
  }
  return reasons;
}

function scoreCandidate(c: Ds4RpmPilotTripCandidateDescriptorV1): number {
  if (identityMissing(c)) {
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

export type RankDs4RpmPilotTripCandidatesOptionsV1 = {
  cohortContext: Ds4RpmPilotPreparationTargetCohortV1;
};

/**
 * Deterministic offline ranking — does not select a trip as authoritative.
 * Invalid rows abstain individually; valid rows ranked within cohort.
 */
export function rankDs4RpmPilotTripCandidatesV1(
  candidates: readonly Ds4RpmPilotTripCandidateDescriptorV1[],
  options: RankDs4RpmPilotTripCandidatesOptionsV1,
): Ds4RpmPilotRankedTripCandidateV1[] {
  const scoped = candidates.filter((c) => assertPilotCohortInScope(c.cohortVehicleLabel));
  if (scoped.length === 0) {
    return cohortEmptyAbstain(options.cohortContext, ['NO_IN_SCOPE_CANDIDATES']);
  }

  const abstainRows: Ds4RpmPilotRankedTripCandidateV1[] = [];
  const defensible: Array<{
    candidate: Ds4RpmPilotTripCandidateDescriptorV1;
    selectionScore: number;
    planningClassifications: ReturnType<typeof classifyDs4RpmPilotScientificPlanningV1>;
  }> = [];

  for (const candidate of scoped) {
    const selectionScore = scoreCandidate(candidate);
    if (selectionScore < 0) {
      abstainRows.push(candidateAbstainRow(candidate, gateReasons(candidate, selectionScore)));
      continue;
    }
    defensible.push({
      candidate,
      selectionScore,
      planningClassifications: classifyDs4RpmPilotScientificPlanningV1({
        telemetrySourceFamily: candidate.telemetrySourceFamily,
        sourceFamilyAttestation: candidate.sourceFamilyAttestation,
        v1bAdmissionSucceeded: candidate.v1bAdmissionSucceeded,
        motionRunPresent: candidate.motionRunPresent,
        rpmPointCount: candidate.rpmPointCount,
        authorizedRealObservation: false,
        dataQualityAssessmentEvidencePresent: candidate.dataQualityAssessmentEvidencePresent,
      }),
    });
  }

  defensible.sort((a, b) => {
    if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
    return a.candidate.candidateTripId.localeCompare(b.candidate.candidateTripId);
  });

  const ranked: Ds4RpmPilotRankedTripCandidateV1[] = defensible.map((row, index) => ({
    rank: index + 1,
    candidate: row.candidate,
    selectionScore: row.selectionScore,
    planningClassifications: row.planningClassifications,
    tripSelected: false,
    abstainReasons: [],
  }));

  abstainRows.sort((a, b) =>
    a.candidate.candidateTripId.localeCompare(b.candidate.candidateTripId),
  );

  if (ranked.length === 0) {
    return abstainRows.length > 0
      ? abstainRows
      : cohortEmptyAbstain(options.cohortContext, ['NO_DEFENSIBLE_CANDIDATES_AFTER_GATES']);
  }

  return [...ranked, ...abstainRows];
}
