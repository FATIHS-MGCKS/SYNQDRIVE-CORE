import type { VsiP0aAuditCohort } from './vsi-p0a-signal-integrity-audit.types';

/** Production fleet cohort (read-only audits). IDs from verified production exports — not QA fixture UUIDs. */
export const VSI_P0A_DEFAULT_ORGANIZATION_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a' as const;

export const VSI_P0A_DEFAULT_COHORT_V1: VsiP0aAuditCohort = {
  organizationId: VSI_P0A_DEFAULT_ORGANIZATION_ID,
  vehicles: [
    {
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      vehicleLabel: 'Tesla Model 3 (KS FH 660E)',
      make: 'Tesla',
      model: 'Model 3',
      fuelType: 'ELECTRIC',
      powertrainClass: 'EV',
      providerModality: 'API_SYNTHETIC',
    },
    {
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      vehicleLabel: 'VW Tiguan (WOB L 7503)',
      make: 'Volkswagen',
      model: 'Tiguan',
      fuelType: 'GASOLINE',
      powertrainClass: 'ICE',
      providerModality: 'RUPTELA_R1',
    },
    {
      vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      vehicleLabel: 'Audi A4 (KS MS 661)',
      make: 'Audi',
      model: 'A4',
      fuelType: 'GASOLINE',
      powertrainClass: 'ICE',
      providerModality: 'RUPTELA_R1',
    },
    {
      vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
      vehicleLabel: 'VW Arteon (HMÜ C 215)',
      make: 'Volkswagen',
      model: 'Arteon',
      fuelType: 'GASOLINE',
      powertrainClass: 'ICE',
      providerModality: 'RUPTELA_R1',
    },
  ],
};

export function resolveVsiP0aCohortFromEnv(): VsiP0aAuditCohort {
  const org = process.env.VSI_P0A_ORG_ID?.trim() || VSI_P0A_DEFAULT_ORGANIZATION_ID;
  const raw = process.env.VSI_P0A_COHORT_JSON?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as VsiP0aAuditCohort;
    return { ...parsed, organizationId: parsed.organizationId || org };
  }
  return { ...VSI_P0A_DEFAULT_COHORT_V1, organizationId: org };
}
