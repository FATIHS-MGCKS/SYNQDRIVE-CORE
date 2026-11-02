/**
 * AI Tire Spec — Normalization, Validation, Persistence Builder (V2)
 */

import { AiTireSpec } from './tire-health.config';
import { normalizeTireSpecConfidenceScore } from './ai-tire-spec-confidence.util';
import {
  AI_TIRE_SPEC_LLM_FIELD_KEYS,
  AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
} from './ai-tire-spec-canonical.contract';

const SEASON_TYPES = new Set(['summer', 'winter', 'all_season']);
const VEHICLE_CLASS_FITS = new Set(['passenger', 'suv', 'van', 'truck', 'sport', 'luxury', 'commercial']);
const INTENDED_USES = new Set([
  'touring',
  'sport',
  'off_road',
  'urban',
  'highway',
  'mixed',
  'comfort',
  'eco',
  'track',
  'economy',
  'passenger',
]);
const TIRE_ARCHETYPES = new Set([
  'touring',
  'comfort',
  'sport',
  'ultra_high_performance',
  'performance',
  'all_terrain',
  'mud_terrain',
  'winter_studded',
  'winter_non_studded',
  'winter_performance',
  'eco',
  'van_commercial',
  'run_flat',
  'ev_optimized',
  'highway',
  'luxury',
  'commercial',
  'budget',
  'default',
]);
const SPEC_SOURCE_TYPES = new Set(['ai_agent', 'manual', 'import', 'ocr']);
const UTQG_LETTERS = new Set(['AA', 'A', 'B', 'C']);
const EU_LABEL_CLASSES = new Set(['A', 'B', 'C', 'D', 'E']);

export interface PersistedAiTireSpec extends AiTireSpec {
  userConfirmedSpec: boolean;
  specSourceType: string;
  tireSpecConfidence: number | null;
  fetchedAt: string;
  jobId: string | null;
  normalizedAt: string;
  schemaVersion?: string;
}

export interface AiTireSpecValidation {
  valid: boolean;
  hasStructuredData: boolean;
  fieldCount: number;
  nullFieldCount: number;
  warnings: string[];
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toNormalizedEnum(v: unknown, allowed: Set<string>): string | null {
  if (v == null) return null;
  const normalized = String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.has(normalized) ? normalized : null;
}

function toUtqgEnum(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return UTQG_LETTERS.has(s) ? s : null;
}

function toEuLabelClass(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return EU_LABEL_CLASSES.has(s) ? s : null;
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

function toFiniteNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function inRangeOrNull(v: number | null, min: number, max: number): number | null {
  if (v == null) return null;
  if (v < min || v > max) return null;
  return v;
}

function toIntendedUseValue(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const tags = v
      .map((item) => String(item).trim().toLowerCase().replace(/[\s-]+/g, '_'))
      .filter((tag) => tag && INTENDED_USES.has(tag));
    return tags.length > 0 ? tags.join(',') : null;
  }
  if (typeof v === 'string' && v.trim()) {
    const tags = v
      .split(/[,;|/]/)
      .map((s) => s.trim().toLowerCase().replace(/[\s-]+/g, '_'))
      .filter((tag) => tag && INTENDED_USES.has(tag));
    return tags.length > 0 ? tags.join(',') : toNormalizedEnum(v, INTENDED_USES);
  }
  return null;
}

/** Keys the normalizer reads from raw LLM output (must match schema contract). */
export const AI_TIRE_SPEC_NORMALIZER_INPUT_KEYS = [...AI_TIRE_SPEC_LLM_FIELD_KEYS] as const;

export function normalizeAiTireSpecResult(
  raw: Record<string, unknown> | null | undefined,
): AiTireSpec {
  const empty = buildEmptySpec();
  if (!raw || typeof raw !== 'object') return empty;

  return {
    matchedBrand: toStringOrNull(raw.matchedBrand),
    matchedModel: toStringOrNull(raw.matchedModel),
    matchedVariant: toStringOrNull(raw.matchedVariant),
    tireSizeRaw: toStringOrNull(raw.tireSizeRaw),
    widthMm: inRangeOrNull(toFiniteNumberOrNull(raw.widthMm), 100, 400),
    aspectRatio: inRangeOrNull(toFiniteNumberOrNull(raw.aspectRatio), 20, 90),
    rimDiameterInch: inRangeOrNull(toFiniteNumberOrNull(raw.rimDiameterInch), 10, 26),
    loadIndex: toStringOrNull(raw.loadIndex),
    speedIndex: toStringOrNull(raw.speedIndex),
    seasonType: toNormalizedEnum(raw.seasonType, SEASON_TYPES),
    vehicleClassFit: toNormalizedEnum(raw.vehicleClassFit, VEHICLE_CLASS_FITS),
    runFlat: toBoolOrNull(raw.runFlat),
    reinforced: toBoolOrNull(raw.reinforced),
    xl: toBoolOrNull(raw.xl),
    evOptimized: toBoolOrNull(raw.evOptimized),
    oeHomologation: toStringOrNull(raw.oeHomologation),
    sectionWidthMm: inRangeOrNull(toFiniteNumberOrNull(raw.sectionWidthMm), 125, 355),
    overallDiameterMm: inRangeOrNull(toFiniteNumberOrNull(raw.overallDiameterMm), 400, 900),
    approvedRimWidthMinIn: inRangeOrNull(toFiniteNumberOrNull(raw.approvedRimWidthMinIn), 4, 14),
    approvedRimWidthMaxIn: inRangeOrNull(toFiniteNumberOrNull(raw.approvedRimWidthMaxIn), 4, 14),
    measuredRimWidthIn: inRangeOrNull(toFiniteNumberOrNull(raw.measuredRimWidthIn), 4, 14),
    revsPerKm: inRangeOrNull(toFiniteNumberOrNull(raw.revsPerKm), 300, 600),
    maxLoadKg: inRangeOrNull(toFiniteNumberOrNull(raw.maxLoadKg), 200, 4000),
    maxInflationKpa: inRangeOrNull(toFiniteNumberOrNull(raw.maxInflationKpa), 150, 500),
    maxInflationPsi: inRangeOrNull(toFiniteNumberOrNull(raw.maxInflationPsi), 20, 80),
    newTreadDepthMm: inRangeOrNull(toFiniteNumberOrNull(raw.newTreadDepthMm), 4.0, 16.0),
    euRollingResistanceClass: toEuLabelClass(raw.euRollingResistanceClass),
    euWetGripClass: toEuLabelClass(raw.euWetGripClass),
    euExternalNoiseDb: inRangeOrNull(toFiniteNumberOrNull(raw.euExternalNoiseDb), 60, 85),
    euExternalNoiseClass: toEuLabelClass(raw.euExternalNoiseClass),
    severeSnowMarked: toBoolOrNull(raw.severeSnowMarked),
    iceMarked: toBoolOrNull(raw.iceMarked),
    utqgTreadwear: inRangeOrNull(toFiniteNumberOrNull(raw.utqgTreadwear), 60, 800),
    utqgTraction: toUtqgEnum(raw.utqgTraction),
    utqgTemperature: toUtqgEnum(raw.utqgTemperature),
    mileageWarrantyKm: inRangeOrNull(toFiniteNumberOrNull(raw.mileageWarrantyKm), 0, 150_000),
    intendedUse: toIntendedUseValue(raw.intendedUse),
    longevityBias: inRangeOrNull(toFiniteNumberOrNull(raw.longevityBias), 0.0, 1.0),
    aggressiveDrivingSensitivity: inRangeOrNull(
      toFiniteNumberOrNull(raw.aggressiveDrivingSensitivity),
      0.0,
      1.0,
    ),
    underinflationSensitivity: inRangeOrNull(toFiniteNumberOrNull(raw.underinflationSensitivity), 0.0, 1.0),
    heatSensitivity: inRangeOrNull(toFiniteNumberOrNull(raw.heatSensitivity), 0.0, 1.0),
    payloadBias: inRangeOrNull(toFiniteNumberOrNull(raw.payloadBias), 0.0, 1.0),
    urbanBias: inRangeOrNull(toFiniteNumberOrNull(raw.urbanBias), 0.0, 1.0),
    highwayBias: inRangeOrNull(toFiniteNumberOrNull(raw.highwayBias), 0.0, 1.0),
    comfortBias: inRangeOrNull(toFiniteNumberOrNull(raw.comfortBias), 0.0, 1.0),
    efficiencyBias: inRangeOrNull(toFiniteNumberOrNull(raw.efficiencyBias), 0.0, 1.0),
    wetSafetyBias: inRangeOrNull(toFiniteNumberOrNull(raw.wetSafetyBias), 0.0, 1.0),
    sportBias: inRangeOrNull(toFiniteNumberOrNull(raw.sportBias), 0.0, 1.0),
    tireArchetype: toNormalizedEnum(raw.tireArchetype, TIRE_ARCHETYPES),
    confidenceScore: normalizeTireSpecConfidenceScore(raw.confidenceScore),
    legalMinimumMm: null,
    recommendedReplacementDepthMm: null,
    operationalReplacementDepthMm: null,
    manufacturerSourceUrl: null,
    labelSourceUrl: null,
  };
}

export function validateAiTireSpec(spec: AiTireSpec): AiTireSpecValidation {
  const warnings: string[] = [];
  const entries = Object.entries(spec);
  const nonNull = entries.filter(([, v]) => v != null);

  if (!spec.matchedBrand && !spec.matchedModel) {
    warnings.push('No matched brand or model — spec match quality is unknown');
  }
  if (spec.confidenceScore != null && spec.confidenceScore < 30) {
    warnings.push(`Low confidence score: ${spec.confidenceScore}`);
  }

  return {
    valid: nonNull.length > 0,
    hasStructuredData: nonNull.length >= 3,
    fieldCount: nonNull.length,
    nullFieldCount: entries.length - nonNull.length,
    warnings,
  };
}

export function buildPersistedAiTireSpec(
  normalized: AiTireSpec,
  metadata: {
    jobId: string | null;
    confidenceScore: number | null;
    completedAt: string | null;
    specSourceType?: string;
    userConfirmedSpec?: boolean;
  },
): PersistedAiTireSpec {
  return {
    ...normalized,
    userConfirmedSpec: metadata.userConfirmedSpec ?? false,
    specSourceType: toNormalizedEnum(metadata.specSourceType ?? 'ai_agent', SPEC_SOURCE_TYPES) ?? 'ai_agent',
    tireSpecConfidence: metadata.confidenceScore,
    fetchedAt: metadata.completedAt ?? new Date().toISOString(),
    jobId: metadata.jobId,
    normalizedAt: new Date().toISOString(),
    schemaVersion: AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
  };
}

function buildEmptySpec(): AiTireSpec {
  return {
    matchedBrand: null,
    matchedModel: null,
    matchedVariant: null,
    tireSizeRaw: null,
    widthMm: null,
    aspectRatio: null,
    rimDiameterInch: null,
    loadIndex: null,
    speedIndex: null,
    seasonType: null,
    vehicleClassFit: null,
    runFlat: null,
    reinforced: null,
    xl: null,
    evOptimized: null,
    oeHomologation: null,
    sectionWidthMm: null,
    overallDiameterMm: null,
    approvedRimWidthMinIn: null,
    approvedRimWidthMaxIn: null,
    measuredRimWidthIn: null,
    revsPerKm: null,
    maxLoadKg: null,
    maxInflationKpa: null,
    maxInflationPsi: null,
    newTreadDepthMm: null,
    euRollingResistanceClass: null,
    euWetGripClass: null,
    euExternalNoiseDb: null,
    euExternalNoiseClass: null,
    severeSnowMarked: null,
    iceMarked: null,
    utqgTreadwear: null,
    utqgTraction: null,
    utqgTemperature: null,
    mileageWarrantyKm: null,
    legalMinimumMm: null,
    recommendedReplacementDepthMm: null,
    operationalReplacementDepthMm: null,
    intendedUse: null,
    longevityBias: null,
    aggressiveDrivingSensitivity: null,
    underinflationSensitivity: null,
    heatSensitivity: null,
    payloadBias: null,
    urbanBias: null,
    highwayBias: null,
    comfortBias: null,
    efficiencyBias: null,
    wetSafetyBias: null,
    sportBias: null,
    tireArchetype: null,
    confidenceScore: null,
    manufacturerSourceUrl: null,
    labelSourceUrl: null,
  };
}
