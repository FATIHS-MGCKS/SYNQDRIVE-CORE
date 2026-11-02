import { DS4_ASSESSMENT_DRIVING_EXPOSURE_RULE_VERSION_V2 } from '../ds4-assessment-rule-bindings.v1';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from '../ds4-trip-assessment-v1.contract';
import {
  DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1,
  DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION,
} from '../ds4-longitudinal-evidence-quality.v1';
import { DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1 } from '../ds4-longitudinal-load-observables.v1.contract';

export const DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1 = 'DS4_LAYER2_HISTORICAL_EXPORT_V1' as const;

export const DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1 = 'PERSISTED_ASSESSMENT_ONLY' as const;

export const DS4_LAYER2_HISTORICAL_EXPORT_ARTIFACT_FILES_V1 = [
  'manifest.json',
  'assessments.csv',
  'longitudinal_events.csv',
  'exclusions.csv',
  'coverage_summary.json',
] as const;

export type Ds4Layer2HistoricalExportContractVersionsV1 = {
  exportSchemaVersion: typeof DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1;
  assessmentVersion: typeof DS4_TRIP_ASSESSMENT_VERSION_V1;
  layer2ProjectorVersion: typeof DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1;
  exposureContractVersion: typeof DS4_ASSESSMENT_DRIVING_EXPOSURE_RULE_VERSION_V2;
  evidenceQualityContractId: typeof DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1;
  evidenceQualityContractVersion: typeof DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION;
};

export const DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1: Ds4Layer2HistoricalExportContractVersionsV1 = {
  exportSchemaVersion: DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1,
  assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
  layer2ProjectorVersion: DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1,
  exposureContractVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_RULE_VERSION_V2,
  evidenceQualityContractId: DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_V1,
  evidenceQualityContractVersion: DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION,
};
