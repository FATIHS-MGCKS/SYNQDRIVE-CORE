import type { Ds4RpmRealDataReferenceCohortVehicleLabel } from './ds4-rpm-real-data-source-eligibility.contract.v1';

export type Ds4RpmRealDataSourceReadinessRowV1 = {
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  sourceFamilyProven: 'UNPROVEN' | 'BLOCKED_IF_R1' | 'NOT_APPLICABLE';
  timestampAuthority: 'UNPROVEN' | 'BLOCKED_R1' | 'NOT_APPLICABLE';
  correlationEligible: 'UNPROVEN' | 'NOT_APPLICABLE' | 'CONDITIONAL_BLOCKED_IF_R1_PROVEN';
  notes: readonly string[];
};

export type Ds4RpmRealDataSourceReadinessMatrixV1 = {
  contractVersion: 'ds4-rpm-real-data-source-readiness-matrix-v1';
  generatedWithoutLiveAttestation: true;
  rows: readonly Ds4RpmRealDataSourceReadinessRowV1[];
  pilotConclusion:
    | 'NO_ELIGIBLE_REAL_DATA_SOURCE_WITHOUT_OWNER_AUTHORIZED_ATTESTATION'
    | 'NO_ELIGIBLE_REAL_DATA_SOURCE';
  minimalPilotReadPlan: readonly string[];
  openUncertainties: readonly string[];
};

export function buildDs4RpmRealDataReferenceCohortReadinessMatrixV1(): Ds4RpmRealDataSourceReadinessMatrixV1 {
  const rows: Ds4RpmRealDataSourceReadinessRowV1[] = [
    {
      cohortVehicleLabel: 'AUDI_A4',
      sourceFamilyProven: 'UNPROVEN',
      timestampAuthority: 'UNPROVEN',
      correlationEligible: 'UNPROVEN',
      notes: ['No owner-authorized live attestation bundle in PR-B3'],
    },
    {
      cohortVehicleLabel: 'VW_ARTEON',
      sourceFamilyProven: 'UNPROVEN',
      timestampAuthority: 'UNPROVEN',
      correlationEligible: 'UNPROVEN',
      notes: ['Requires persisted DIMO identity + HF/V1B/motion binding per trip'],
    },
    {
      cohortVehicleLabel: 'VW_TIGUAN',
      sourceFamilyProven: 'BLOCKED_IF_R1',
      timestampAuthority: 'UNPROVEN',
      correlationEligible: 'CONDITIONAL_BLOCKED_IF_R1_PROVEN',
      notes: [
        'Entire fleet not permanently ineligible — only trips where attested rawJson proves RUPTELA_R1 are BLOCKED for historical OBD point-time correlation',
        'Non-R1 Tiguan trips remain UNPROVEN pending owner-authorized attestation',
      ],
    },
    {
      cohortVehicleLabel: 'TESLA_MODEL_3',
      sourceFamilyProven: 'NOT_APPLICABLE',
      timestampAuthority: 'NOT_APPLICABLE',
      correlationEligible: 'NOT_APPLICABLE',
      notes: ['ICE RPM correlation not applicable'],
    },
  ];

  return {
    contractVersion: 'ds4-rpm-real-data-source-readiness-matrix-v1',
    generatedWithoutLiveAttestation: true,
    rows,
    pilotConclusion: 'NO_ELIGIBLE_REAL_DATA_SOURCE_WITHOUT_OWNER_AUTHORIZED_ATTESTATION',
    minimalPilotReadPlan: [
      '1. Owner authorization record: orgId, vehicleId, trip allowlist, providerSourceLinkId, bounded ISO window, row budget',
      '2. Read-only Postgres: DimoVehicle.rawJson for scoped vehicle (family resolution audit trail digest only in artifacts)',
      '3. Read-only Postgres: trip row + providerSourceLinkId binding verification',
      '4. Read-only ClickHouse HF: 1s AVG RPM + speed for authorized window only (no interpolation)',
      '5. Read-only persisted V1B shadow summary + motion-core shadow run ids for same trip binding',
      '6. Offline attestation bundle assembly + PR-B3 audit — no correlation ELIGIBLE until all dimensions PROVEN',
      '7. Exclude any trip where resolveTelemetrySourceFamily → RUPTELA_R1 (R1 veto)',
    ],
    openUncertainties: [
      'DS4 label vs DIMO bucket timestamp phase calibration',
      'Interior bucket support width vs event windows',
      'Prevalence of event-local cadence coarser than VSI tier on real trips',
      'Which non-R1 ICE vehicles have complete persisted V1B + motion evidence for pilot trips',
    ],
  };
}
