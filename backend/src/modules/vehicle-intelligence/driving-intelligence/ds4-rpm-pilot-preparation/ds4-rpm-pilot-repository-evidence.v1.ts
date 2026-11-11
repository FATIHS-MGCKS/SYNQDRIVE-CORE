import type {
  Ds4RpmPilotHistoricalIdentityReferenceV1,
  Ds4RpmPilotPreparationTargetCohortV1,
} from './ds4-rpm-pilot-preparation.contract.v1';

/**
 * Repository-only citations — never treated as live Production configuration.
 * Full UUIDs intentionally truncated; never commit Production secrets.
 */
export const DS4_RPM_PILOT_REPOSITORY_HISTORICAL_REFERENCES: Record<
  Ds4RpmPilotPreparationTargetCohortV1,
  readonly Ds4RpmPilotHistoricalIdentityReferenceV1[]
> = {
  AUDI_A4: [
    {
      plateLabel: 'KS MS 661',
      historicalVehicleIdHint: 'c10351f8-…',
      historicalDimoTokenHint: '187361',
      epistemicStatus: 'HISTORICAL_UNVERIFIED',
      repositoryCitation:
        'architecture/drivingintelligence/research/CHANGE_LEDGER.md (EXP-021 KS MS 661 forensic / evidence freeze entries)',
      notes: [
        'Audi A4 2016 referenced in EXP-021 physical-run research',
        'Live org/vehicle/trip binding not verified in this operation',
      ],
    },
  ],
  VW_TIGUAN: [
    {
      plateLabel: 'WOB L 7503',
      historicalVehicleIdHint: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      historicalDimoTokenHint: '192922',
      epistemicStatus: 'HISTORICAL_UNVERIFIED',
      repositoryCitation:
        'architecture/drivingintelligence/research/CHANGE_LEDGER.md (EXP-021 WOB L 7503 pre-drive / LTE_R1 reference drive entries)',
      notes: [
        'LTE R1 reference-drive session cited in repository evidence',
        'RUPTELA_R1 risk must be resolved from persisted rawJson — not from plate or model',
      ],
    },
  ],
};
