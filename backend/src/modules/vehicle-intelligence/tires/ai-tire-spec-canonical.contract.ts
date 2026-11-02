/**
 * Canonical AiTireSpec fields (storage + normalizer read surface).
 * Historical tire_v2 LLM requests used all 50 keys; tire_v3_compact requests 24.
 *
 * Policy thresholds, legal minimums, and URL "evidence" are intentionally excluded from LLM schemas.
 */
export const AI_TIRE_SPEC_V3_COMPACT_CORE_KEYS = [
  'matchedBrand',
  'matchedModel',
  'tireSizeRaw',
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'loadIndex',
  'speedIndex',
  'seasonType',
  'newTreadDepthMm',
  'tireArchetype',
  'runFlat',
  'xl',
  'reinforced',
] as const;

export const AI_TIRE_SPEC_V3_COMPACT_OPTIONAL_KEYS = [
  'matchedVariant',
  'oeHomologation',
  'severeSnowMarked',
  'iceMarked',
  'evOptimized',
  'euRollingResistanceClass',
  'euWetGripClass',
  'euExternalNoiseDb',
  'euExternalNoiseClass',
  'utqgTreadwear',
] as const;

export const AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS = [
  ...AI_TIRE_SPEC_V3_COMPACT_CORE_KEYS,
  ...AI_TIRE_SPEC_V3_COMPACT_OPTIONAL_KEYS,
] as const;

export type AiTireSpecV3CompactLlmFieldKey =
  (typeof AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS)[number];

export const AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION = 'tire_v3_compact';

/** Legacy full Mistral request set (read/normalize compatibility). */
export const AI_TIRE_SPEC_LLM_FIELD_KEYS = [
  'matchedBrand',
  'matchedModel',
  'matchedVariant',
  'seasonType',
  'vehicleClassFit',
  'runFlat',
  'reinforced',
  'xl',
  'oeHomologation',
  'tireSizeRaw',
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'loadIndex',
  'speedIndex',
  'newTreadDepthMm',
  'sectionWidthMm',
  'overallDiameterMm',
  'approvedRimWidthMinIn',
  'approvedRimWidthMaxIn',
  'measuredRimWidthIn',
  'revsPerKm',
  'maxLoadKg',
  'maxInflationKpa',
  'maxInflationPsi',
  'euRollingResistanceClass',
  'euWetGripClass',
  'euExternalNoiseDb',
  'euExternalNoiseClass',
  'severeSnowMarked',
  'iceMarked',
  'utqgTreadwear',
  'utqgTraction',
  'utqgTemperature',
  'mileageWarrantyKm',
  'evOptimized',
  'intendedUse',
  'comfortBias',
  'efficiencyBias',
  'wetSafetyBias',
  'sportBias',
  'longevityBias',
  'payloadBias',
  'urbanBias',
  'highwayBias',
  'aggressiveDrivingSensitivity',
  'underinflationSensitivity',
  'heatSensitivity',
  'tireArchetype',
  'confidenceScore',
] as const;

export type AiTireSpecLlmFieldKey = (typeof AI_TIRE_SPEC_LLM_FIELD_KEYS)[number];

export const AI_TIRE_SPEC_EXCLUDED_FROM_V3_COMPACT_LLM_KEYS = [
  'vehicleClassFit',
  'sectionWidthMm',
  'overallDiameterMm',
  'approvedRimWidthMinIn',
  'approvedRimWidthMaxIn',
  'measuredRimWidthIn',
  'revsPerKm',
  'maxLoadKg',
  'maxInflationKpa',
  'maxInflationPsi',
  'mileageWarrantyKm',
  'intendedUse',
  'comfortBias',
  'efficiencyBias',
  'wetSafetyBias',
  'sportBias',
  'longevityBias',
  'payloadBias',
  'urbanBias',
  'highwayBias',
  'aggressiveDrivingSensitivity',
  'underinflationSensitivity',
  'heatSensitivity',
  'utqgTraction',
  'utqgTemperature',
  'confidenceScore',
] as const;

/** @deprecated use AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION for new LLM writes */
export const AI_TIRE_SPEC_SCHEMA_VERSION = 'tire_v2';
