import { DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1 } from './ds4-layer2-historical-export.v1.contract';

export const DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_V1' as const;

export const DS4_LAYER2_P2_RECONSTRUCTION_MODE_V1 = 'NEWLY_COMPUTED_OFFLINE' as const;

/** Feasibility audit operation that pinned this pilot cohort (read-only, 2026-10-30). */
export const DS4_LAYER2_P2_FEASIBILITY_AUDIT_OPERATION_V1 =
  'DS4_LAYER2_P2_HISTORICAL_RECONSTRUCTION_FEASIBILITY' as const;

export const DS4_LAYER2_P2_OFFLINE_ARTIFACT_FILES_V1 = [
  'p2_manifest.json',
  'p2_reconstructed_assessments.csv',
  'p2_longitudinal_events.csv',
  'p2_exclusions.csv',
  'p2_revision_selection.csv',
  'p2_coverage_summary.json',
] as const;

export type Ds4Layer2P2OfflineContractVersionsV1 = typeof DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1 & {
  p2OfflineSchemaVersion: typeof DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1;
};

export const DS4_LAYER2_P2_OFFLINE_CONTRACT_VERSIONS_V1: Ds4Layer2P2OfflineContractVersionsV1 = {
  ...DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1,
  p2OfflineSchemaVersion: DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1,
};
