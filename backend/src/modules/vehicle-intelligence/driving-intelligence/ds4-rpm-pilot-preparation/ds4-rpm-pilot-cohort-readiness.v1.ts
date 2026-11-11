import type {
  Ds4RpmPilotDs4MotionReadinessV1,
  Ds4RpmPilotIdentityReadinessV1,
  Ds4RpmPilotPreparationTargetCohortV1,
  Ds4RpmPilotRpmEvidenceReadinessV1,
  Ds4RpmPilotSourceFamilyReadinessV1,
} from './ds4-rpm-pilot-preparation.contract.v1';
import { DS4_RPM_PILOT_REPOSITORY_HISTORICAL_REFERENCES } from './ds4-rpm-pilot-repository-evidence.v1';

const RPM_FUTURE_READ = [
  'V1A trip input row with org/vehicle/trip/providerSourceLinkId binding',
  'Tier-aware V1B shadow result + v1bRunId',
  'computeDs4RpmHfV1bTierAwareInputFingerprint on canonical trip points',
  'ClickHouse HF RPM 1s AVG for owner-bounded window (no interpolation)',
  'VSI cadence classification slice from V1B tier evidence',
  'Duplicate/conflicting RPM label diagnostics from trip dataQuality',
  'ICE RPM admission envelope on V1A',
] as const;

const DS4_FUTURE_READ = [
  'Persisted motion-core shadow run id bound to same org/vehicle/trip',
  'DS4 motion payload content fingerprint (not injected-bundle attestation)',
  'Full persisted event rows (V1/V2 material parity)',
  'Motion algorithm version manifest from shadow run metadata',
  'Speed bucket coverage inside trip window',
] as const;

const FAMILY_RESOLUTION_EVIDENCE = [
  'Read-only Postgres DimoVehicle.rawJson for scoped vehicleId',
  'resolveTelemetrySourceFamily audit digest only in artifacts (no raw serial)',
  'Independent owner authorization context (PR-B3)',
  'Reject hardwareType / model / plate as family authority',
] as const;

export function buildDs4RpmPilotIdentityReadinessV1(
  cohort: Ds4RpmPilotPreparationTargetCohortV1,
): Ds4RpmPilotIdentityReadinessV1 {
  return {
    cohortVehicleLabel: cohort,
    organizationId: 'UNVERIFIED',
    vehicleId: 'UNVERIFIED',
    providerSourceLinkId: 'UNVERIFIED',
    historicalReferences: DS4_RPM_PILOT_REPOSITORY_HISTORICAL_REFERENCES[cohort],
    abstainReasons: [
      'LIVE_PRODUCTION_IDENTITY_NOT_READ_IN_P2_D2B',
      'HISTORICAL_REFERENCES_NOT_INDEPENDENTLY_CHECKED',
    ],
  };
}

export function buildDs4RpmPilotSourceFamilyReadinessV1(
  cohort: Ds4RpmPilotPreparationTargetCohortV1,
): Ds4RpmPilotSourceFamilyReadinessV1 {
  const r1RiskNote =
    cohort === 'VW_TIGUAN'
      ? 'Repository cites LTE R1 reference activity — RUPTELA_R1 veto must be assumed until disproven by rawJson'
      : 'Resolve family from rawJson; do not infer from Audi model label';
  return {
    cohortVehicleLabel: cohort,
    resolvedFamily: 'UNKNOWN',
    attestationStatus: 'UNVERIFIED',
    r1ContainmentRequired: true,
    temporalFusionEligibleIfProvenR1: false,
    requiredEvidenceForResolution: [...FAMILY_RESOLUTION_EVIDENCE, r1RiskNote],
    abstainReasons: ['SOURCE_FAMILY_NOT_RESOLVED_WITHOUT_OWNER_AUTHORIZED_READ'],
  };
}

export function buildDs4RpmPilotRpmReadinessV1(
  cohort: Ds4RpmPilotPreparationTargetCohortV1,
): Ds4RpmPilotRpmEvidenceReadinessV1 {
  return {
    cohortVehicleLabel: cohort,
    byCadenceTier: {
      RPM_1S: 'UNVERIFIED',
      RPM_2S: 'UNVERIFIED',
      RPM_3S: 'UNVERIFIED',
      SPARSE: 'UNVERIFIED',
      UNKNOWN: 'UNKNOWN',
    },
    rpm3sEventLocalFusionEligible: false,
    futureReadRequirements: [...RPM_FUTURE_READ],
    abstainReasons: ['NO_REAL_RPM_EVIDENCE_COLLECTED_IN_P2_D2B'],
  };
}

export function buildDs4RpmPilotDs4ReadinessV1(
  cohort: Ds4RpmPilotPreparationTargetCohortV1,
): Ds4RpmPilotDs4MotionReadinessV1 {
  return {
    cohortVehicleLabel: cohort,
    persistedMotionRunAttestation: 'UNVERIFIED',
    eventMaterialParityRequired: true,
    futureReadRequirements: [...DS4_FUTURE_READ],
    abstainReasons: ['NO_PERSISTED_MOTION_RUN_ATTESTED_IN_P2_D2B'],
  };
}
