/**
 * Pinned DS4 Layer-2 P2 research cohort (11 trips @ evaluation SHA 355d9cb6…).
 * Checksums from export-11-gated run 2026-10-30T22:40:00Z — do not mutate underlying CSV fixtures.
 */
export const DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1 =
  '355d9cb6d5e5204465274fb1229168c516322755' as const;

export const DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1 =
  'faa710c9-6d91-4079-a7d5-91fdccdec14a' as const;

export const DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1 = 129 as const;

export const DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1 =
  '1ac436d2c60ff0cc49d7578d51a004585778991f413cd127d7d3ec0a42ee516f' as const;

export const DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1 = {
  'p2_reconstructed_assessments.csv':
    '4e7bf78c63176f99d06f251d687fcfc7a1e428b895d17bae23212f4b7c398edd',
  'p2_longitudinal_events.csv':
    'd438af1911640f1cb9367ae70ef47e91680cd05ef764d46a5d287916d068a314',
  'p2_exclusions.csv': '81ca983cdbd8478be5ab5e97bc77f143b7ed6d592e769caecc10ff30901a54d9',
  'p2_revision_selection.csv':
    '8f8734e97d2085103abd56078d9f0562c00a415d1b3e28c3afddb3db83acaac2',
  'p2_coverage_summary.json':
    '8b2ee1a7c3a21b8cf92d0b83327dd805a689ed554b2a742347948af0a666462d',
} as const;

/** Sorted trip IDs — Tesla/Audi/Tiguan only; no Arteon. */
export const DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1 = [
  '004f9579-2875-42f2-8aa7-e82c343c954e',
  '0a14d29d-167c-4f28-851b-5c6f6e7f3e5d',
  '2ccf0d2a-d5b8-4612-aabe-b4c1f387d9af',
  '3c8827e9-7dd0-46a8-ae7c-eb5c7495c65b',
  '4dcc7cbf-9d1c-4efa-b395-6ad540091143',
  'b304e9ad-0dcb-4b69-a93e-5364078a20a1',
  'ba66e2ad-a824-4944-83c9-4472a5508e82',
  'c0448fea-e7c3-4658-b2fd-417c452f70d7',
  'd06f1e85-cf2f-4d7f-88d7-13e5c0a24ac1',
  'dbdded5c-ee72-40f3-91bb-62d5a1b7f7ff',
  'dfc7c443-d847-4d31-8c84-9c0f11e47e1e',
] as const;

export const DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1 = {
  AUDI_A4: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
  VW_TIGUAN: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  TESLA_MODEL_3: '68868291-5478-42cd-b0c4-cc77b2a78e21',
} as const;

/** Explicit exclusion guard — Arteon must not appear in pinned cohort. */
export const DS4_LAYER2_P2_PINNED_11_EXCLUDED_VEHICLE_IDS_V1 = [
  '8c850ff1-4201-432b-af2e-2711dbc7ca48',
] as const;

export const DS4_LAYER2_P3B_MERGE_SHA_REFERENCE_V1 =
  '7e100d6558626ebeca621af2a5c50a7438396a1a' as const;
