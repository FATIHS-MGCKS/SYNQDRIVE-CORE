import type { Ds4RpmPilotPreparationReportV1, Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotTripCandidateDescriptorV1 } from './ds4-rpm-pilot-preparation.contract.v1';
import {
  buildDs4RpmPilotDs4ReadinessV1,
  buildDs4RpmPilotIdentityReadinessV1,
  buildDs4RpmPilotRpmReadinessV1,
  buildDs4RpmPilotSourceFamilyReadinessV1,
} from './ds4-rpm-pilot-cohort-readiness.v1';
import { buildDs4RpmPilotMinimalReadPlanV1 } from './ds4-rpm-pilot-minimal-read-plan.v1';
import { DS4_RPM_PILOT_PREPARATION_CONTRACT_VERSION } from './ds4-rpm-pilot-preparation.contract.v1';
import { rankDs4RpmPilotTripCandidatesV1 } from './ds4-rpm-pilot-trip-candidate-ranking.v1';

const TARGETS: readonly Ds4RpmPilotPreparationTargetCohortV1[] = ['AUDI_A4', 'VW_TIGUAN'];

export function buildDs4RpmPilotPreparationReportV1(input: {
  baseSha: string;
  offlineTripCandidates?: readonly Ds4RpmPilotTripCandidateDescriptorV1[];
}): Ds4RpmPilotPreparationReportV1 {
  const candidates = input.offlineTripCandidates ?? [];

  const identityReadiness = Object.fromEntries(
    TARGETS.map((c) => [c, buildDs4RpmPilotIdentityReadinessV1(c)]),
  ) as Ds4RpmPilotPreparationReportV1['identityReadiness'];

  const sourceFamilyReadiness = Object.fromEntries(
    TARGETS.map((c) => [c, buildDs4RpmPilotSourceFamilyReadinessV1(c)]),
  ) as Ds4RpmPilotPreparationReportV1['sourceFamilyReadiness'];

  const rpmReadiness = Object.fromEntries(
    TARGETS.map((c) => [c, buildDs4RpmPilotRpmReadinessV1(c)]),
  ) as Ds4RpmPilotPreparationReportV1['rpmReadiness'];

  const ds4Readiness = Object.fromEntries(
    TARGETS.map((c) => [c, buildDs4RpmPilotDs4ReadinessV1(c)]),
  ) as Ds4RpmPilotPreparationReportV1['ds4Readiness'];

  const candidateRankingByCohort = {
    AUDI_A4: rankDs4RpmPilotTripCandidatesV1(
      candidates.filter((c) => c.cohortVehicleLabel === 'AUDI_A4'),
      { cohortContext: 'AUDI_A4' },
    ),
    VW_TIGUAN: rankDs4RpmPilotTripCandidatesV1(
      candidates.filter((c) => c.cohortVehicleLabel === 'VW_TIGUAN'),
      { cohortContext: 'VW_TIGUAN' },
    ),
  } satisfies Ds4RpmPilotPreparationReportV1['candidateRankingByCohort'];

  const minimalReadPlan = Object.fromEntries(
    TARGETS.map((c) => [c, buildDs4RpmPilotMinimalReadPlanV1(c)]),
  ) as Ds4RpmPilotPreparationReportV1['minimalReadPlan'];

  return {
    contractVersion: DS4_RPM_PILOT_PREPARATION_CONTRACT_VERSION,
    operation: 'DBI_P2D2B_AUDI_TIGUAN_REAL_DATA_PILOT_PREPARATION',
    baseSha: input.baseSha,
    excludedCohorts: ['VW_ARTEON', 'TESLA_MODEL_3'],
    targetCohorts: [...TARGETS],
    noProductionReadsPerformed: true,
    noProviderCallsPerformed: true,
    identityReadiness,
    sourceFamilyReadiness,
    rpmReadiness,
    ds4Readiness,
    candidateRankingByCohort,
    minimalReadPlan,
    missingEvidenceInventory: [
      'Live org/vehicle/trip/providerSourceLinkId for KS MS 661 and WOB L 7503',
      'Persisted DimoVehicle.rawJson family resolution under owner scope',
      'Attested V1B + motion shadow run for one bounded historical trip per vehicle',
      'Owner-authorized pilot read context (PR-B3) — not execution permission',
      'Independent timestamp authority (separate scientific decision)',
    ],
    goNoGoMatrix: [
      {
        gate: 'OWNER_AUTHORIZED_READ_SCOPE',
        audi: 'NO_GO',
        tiguan: 'NO_GO',
        notes: 'Scope checks exist; owner production read not approved in P2-D2B',
      },
      {
        gate: 'SOURCE_FAMILY_RESOLVED',
        audi: 'NO_GO',
        tiguan: 'CONDITIONAL',
        notes: 'Tiguan repository cites R1 risk — fusion blocked if RUPTELA_R1 proven',
      },
      {
        gate: 'RPM_V1B_V1A_BINDING',
        audi: 'NO_GO',
        tiguan: 'NO_GO',
        notes: 'No real evidence extracted',
      },
      {
        gate: 'DS4_MOTION_RUN_ATTESTED',
        audi: 'NO_GO',
        tiguan: 'NO_GO',
        notes: 'Persisted motion provenance UNVERIFIED',
      },
      {
        gate: 'OFFLINE_SYNTHETIC_REGRESSION',
        audi: 'GO',
        tiguan: 'GO',
        notes: 'P2-D2A/B2/B3/P2-D1 paths remain research-only',
      },
    ],
    ownerApprovalChecklist: [
      'Confirm target orgId and vehicleId for each plate',
      'Sign trip allowlist + bounded ISO query window',
      'Approve providerSourceLinkId and row/budget caps',
      'Acknowledge R1 veto if rawJson resolves RUPTELA_R1',
      'Acknowledge REAL_OBSERVATION remains unauthorized until separate gate',
      'Authorize read-only extraction only (no deploy, no scoring)',
    ],
  };
}
