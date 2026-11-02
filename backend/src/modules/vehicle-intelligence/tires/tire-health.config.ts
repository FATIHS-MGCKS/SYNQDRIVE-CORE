/**
 * Tire Health Tracking Module — Centralized Configuration V2
 *
 * ALL tunable constants for the tire wear model live here.
 * Do NOT scatter the same thresholds across service files.
 *
 * V2 adds: tire archetype awareness, pressure wear, load factor,
 * heat stress model, season mismatch, interaction penalty,
 * behavior sensitivity modulation, and source priority types.
 */

import { parseValidatedAiTireSpecFromStorage } from './ai-tire-spec-read.util';

// ── AI Tire Spec shape (stored as JSON on VehicleTireSetup.aiTireSpec) ──────

export interface AiTireSpec {
  matchedBrand?: string | null;
  matchedModel?: string | null;
  matchedVariant?: string | null;
  tireSizeRaw?: string | null;
  widthMm?: number | null;
  aspectRatio?: number | null;
  rimDiameterInch?: number | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
  seasonType?: string | null;
  vehicleClassFit?: string | null;
  runFlat?: boolean | null;
  reinforced?: boolean | null;
  xl?: boolean | null;
  evOptimized?: boolean | null;
  oeHomologation?: string | null;
  sectionWidthMm?: number | null;
  overallDiameterMm?: number | null;
  approvedRimWidthMinIn?: number | null;
  approvedRimWidthMaxIn?: number | null;
  measuredRimWidthIn?: number | null;
  revsPerKm?: number | null;
  euRollingResistanceClass?: string | null;
  euWetGripClass?: string | null;
  euExternalNoiseDb?: number | null;
  euExternalNoiseClass?: string | null;
  severeSnowMarked?: boolean | null;
  iceMarked?: boolean | null;
  utqgTreadwear?: number | null;
  utqgTraction?: string | null;
  utqgTemperature?: string | null;
  mileageWarrantyKm?: number | null;
  comfortBias?: number | null;
  efficiencyBias?: number | null;
  wetSafetyBias?: number | null;
  sportBias?: number | null;
  maxLoadKg?: number | null;
  maxInflationKpa?: number | null;
  maxInflationPsi?: number | null;
  newTreadDepthMm?: number | null;
  legalMinimumMm?: number | null;
  recommendedReplacementDepthMm?: number | null;
  operationalReplacementDepthMm?: number | null;
  intendedUse?: string | null;
  longevityBias?: number | null;
  aggressiveDrivingSensitivity?: number | null;
  underinflationSensitivity?: number | null;
  heatSensitivity?: number | null;
  payloadBias?: number | null;
  urbanBias?: number | null;
  highwayBias?: number | null;
  tireArchetype?: string | null;
  confidenceScore?: number | null;
  manufacturerSourceUrl?: string | null;
  labelSourceUrl?: string | null;
  userConfirmedSpec?: boolean | null;
  specSourceType?: string | null;
}

// ── Source priority enums ───────────────────────────────────────────────────

export type TreadSource =
  | 'manual_measurement'
  | 'calibration_projection'
  | 'initial_manual_plus_wear'
  | 'fallback_estimate';

export type NewTreadRefSource =
  | 'manual_confirmed'
  | 'ai_spec'
  | 'archetype_default'
  | 'season_fallback';

export type ReplacementThresholdSource =
  | 'spec_operational'
  | 'spec_recommended'
  | 'season_fallback'
  | 'legal_minimum';

// ── Tire archetype definitions ──────────────────────────────────────────────

export type TireArchetype =
  | 'touring'
  | 'comfort'
  | 'sport'
  | 'ultra_high_performance'
  | 'all_terrain'
  | 'mud_terrain'
  | 'winter_studded'
  | 'winter_non_studded'
  | 'eco'
  | 'van_commercial'
  | 'run_flat'
  | 'ev_optimized'
  | 'default';

export const TIRE_HEALTH_CONFIG = {
  // ── Replace / legal thresholds ──────────────────────────────────────────────

  legalMinTreadMm: 1.6,

  replaceThresholds: {
    SUMMER: 3.0,
    WINTER: 4.0,
    ALL_SEASON: 3.0,
    TRACK: 3.0,
    OTHER: 3.0,
  } as Record<string, number>,

  defaultReplaceThresholdMm: 3.0,

  // ── Default initial tread depths ────────────────────────────────────────────

  defaultInitialTreadMm: {
    summerPassenger: 8.0,
    winterPassenger: 8.5,
    allSeasonPassenger: 8.0,
    van: 8.5,
    performance: 7.5,
  },

  /** Fallback when nothing else is known. */
  defaultInitialTreadFallbackMm: 8.0,

  // ── Archetype-aware expected life & new tread defaults ────────────────────

  archetypeDefaults: {
    touring:                { expectedLifeKm: 50000, newTreadMm: 8.0, replaceMm: 3.0, longevityBias: 1.15 },
    comfort:                { expectedLifeKm: 45000, newTreadMm: 8.0, replaceMm: 3.0, longevityBias: 1.10 },
    sport:                  { expectedLifeKm: 28000, newTreadMm: 7.5, replaceMm: 3.0, longevityBias: 0.80 },
    ultra_high_performance: { expectedLifeKm: 22000, newTreadMm: 7.0, replaceMm: 3.0, longevityBias: 0.70 },
    all_terrain:            { expectedLifeKm: 55000, newTreadMm: 10.0, replaceMm: 3.5, longevityBias: 1.20 },
    mud_terrain:            { expectedLifeKm: 45000, newTreadMm: 12.0, replaceMm: 4.0, longevityBias: 1.10 },
    winter_studded:         { expectedLifeKm: 28000, newTreadMm: 9.0, replaceMm: 4.0, longevityBias: 0.90 },
    winter_non_studded:     { expectedLifeKm: 32000, newTreadMm: 8.5, replaceMm: 4.0, longevityBias: 0.95 },
    eco:                    { expectedLifeKm: 55000, newTreadMm: 7.5, replaceMm: 3.0, longevityBias: 1.25 },
    van_commercial:         { expectedLifeKm: 42000, newTreadMm: 8.5, replaceMm: 3.5, longevityBias: 1.05 },
    run_flat:               { expectedLifeKm: 35000, newTreadMm: 7.5, replaceMm: 3.0, longevityBias: 0.90 },
    ev_optimized:           { expectedLifeKm: 40000, newTreadMm: 8.0, replaceMm: 3.0, longevityBias: 1.05 },
    default:                { expectedLifeKm: 38000, newTreadMm: 8.0, replaceMm: 3.0, longevityBias: 1.00 },
  } as Record<string, { expectedLifeKm: number; newTreadMm: number; replaceMm: number; longevityBias: number }>,

  // ── Expected tire life by category (legacy, kept as fallback) ─────────────

  expectedLifeKm: {
    SUMMER: { min: 35000, max: 45000, default: 40000 },
    WINTER: { min: 25000, max: 35000, default: 30000 },
    ALL_SEASON: { min: 30000, max: 40000, default: 35000 },
    TRACK: { min: 8000, max: 15000, default: 12000 },
    OTHER: { min: 25000, max: 40000, default: 32000 },
    VAN_COMMERCIAL: { min: 30000, max: 50000, default: 40000 },
    TAXI_URBAN: { min: 20000, max: 30000, default: 25000 },
    PERFORMANCE_SUMMER: { min: 22000, max: 34000, default: 28000 },
  } as Record<string, { min: number; max: number; default: number }>,

  urbanHeavyLifeMultiplier: 0.92,

  // ── Usage factors (from Driving Impact Engine city/highway/country split) ───

  usageFactors: {
    city: 1.12,
    highway: 0.95,
    countryRoad: 1.03,
  },

  // ── Temperature factors (trip-start temperature) ────────────────────────────

  temperatureFactors: {
    below0: 1.03,
    from0to5: 1.02,
    from5to28: 1.00,
    from28to35: 1.03,
    above35: 1.06,
  },

  // ── Heat stress model (combines ambient, speed, pressure, driving) ────────

  heatStress: {
    ambientWeight: 0.40,
    speedWeight: 0.25,
    pressureWeight: 0.20,
    drivingWeight: 0.15,
    highSpeedThresholdKmh: 130,
    highSpeedExposureBonus: 0.04,
    factorMin: 0.98,
    factorMax: 1.12,
  },

  // ── Axle / drivetrain factor defaults ───────────────────────────────────────

  drivetrainBias: {
    FWD: { front: 1.08, rear: 0.96 },
    RWD: { front: 0.97, rear: 1.08 },
    AWD: { front: 1.02, rear: 1.02 },
    '4WD': { front: 1.02, rear: 1.02 },
    default: { front: 1.03, rear: 1.03 },
  } as Record<string, { front: number; rear: number }>,

  steeringAxleBias: { front: 1.05, rear: 1.00 },

  loadBiasDampingCoeff: 0.35,

  // ── Behavior factor mapping (from Driving Impact Engine scores 0–100) ──────

  behaviorFactorWeights: {
    longitudinal: 0.50,
    braking: 0.35,
    drivingStress: 0.15,
  },

  behaviorScoreAnchors: [
    { score: 0, factor: 0.97 },
    { score: 20, factor: 1.00 },
    { score: 50, factor: 1.08 },
    { score: 75, factor: 1.20 },
    { score: 100, factor: 1.35 },
  ],

  scoreFactorByDrivingScore: {
    excellent: 0.98,
    normal: 1.00,
    elevated: 1.03,
    poor: 1.06,
  },

  // ── Pressure wear factor ──────────────────────────────────────────────────

  pressure: {
    nominalPressureBar: 2.5,
    underinflationThresholdBar: 0.3,
    severeUnderinflationBar: 0.6,
    axleImbalanceThresholdBar: 0.25,
    factorMin: 1.00,
    factorMax: 1.18,
    deviationPerBarPenalty: 0.06,
    chronicUnderinflationPenalty: 0.04,
    severeEventPenalty: 0.03,
    instabilityPenalty: 0.02,
    axleImbalancePenalty: 0.02,
    sideImbalancePenalty: 0.01,
    minReadingsForActive: 3,
  },

  // ── Load factor ───────────────────────────────────────────────────────────

  load: {
    referenceWeightKg: 1500,
    weightPenaltyPerTon: 0.04,
    frontDrivenLoadBonus: 0.02,
    xlReinforcedDiscount: 0.97,
    factorMin: 0.97,
    factorMax: 1.15,
  },

  // ── Season mismatch ───────────────────────────────────────────────────────

  seasonMismatch: {
    winterTireHotPenalty: 1.08,
    winterTireHotThresholdC: 25,
    allSeasonHotHighwayPenalty: 1.04,
    allSeasonHotThresholdC: 30,
    summerTireColdPenalty: 1.06,
    summerTireColdThresholdC: 5,
    factorMax: 1.10,
  },

  // ── Interaction penalty (multi-stressor compounding) ──────────────────────

  interaction: {
    maxPenalty: 1.08,
    aggressivePlusUnderinflation: 0.03,
    heatPlusUnderinflation: 0.03,
    highSpeedPlusHeatPlusUnderinflation: 0.04,
    seasonMismatchPlusHeat: 0.02,
    threshold: 1.04,
  },

  // ── Factor clamp ranges ─────────────────────────────────────────────────────

  factorCaps: {
    axleMin: 0.88,
    axleMax: 1.22,
    usageMin: 0.93,
    usageMax: 1.15,
    behaviorMin: 0.97,
    behaviorMax: 1.35,
    pressureMin: 1.00,
    pressureMax: 1.18,
    loadMin: 0.97,
    loadMax: 1.15,
    temperatureMin: 0.98,
    temperatureMax: 1.12,
    seasonMismatchMin: 1.00,
    seasonMismatchMax: 1.10,
    interactionMin: 1.00,
    interactionMax: 1.08,
  },

  // ── Calibration (k-factor) ─────────────────────────────────────────────────

  calibration: {
    minK: 0.75,
    maxK: 1.30,
    alphaFirstMeasurement: 0.12,
    alphaFewMeasurements: 0.18,
    alphaStabilized: 0.24,
    fewMeasurementsThreshold: 3,
    stabilizedThreshold: 4,
    minPredictedWearForCalibrationMm: 0.3,
  },

  // ── Confidence scoring (point-based + sub-dimensions) ─────────────────────

  confidence: {
    initialTreadExists: 20,
    tireSizeComplete: 10,
    brandModelExists: 8,
    loadSpeedIndexExists: 6,
    dotExists: 4,
    odometerConsistent: 12,
    usageSplitAvailable: 10,
    drivingImpactAvailable: 10,
    atLeast500kmObserved: 5,
    atLeast2000kmObserved: 5,
    atLeast1ManualMeasurement: 5,
    atLeast2Measurements: 5,
    kFactorStabilized: 5,
    tirePressureAvailable: 3,
    aiTireSpecMatched: 8,
  },

  confidenceThresholds: {
    high: 80,
    medium: 55,
  },

  remainingKmConfidenceDiscount: {
    high: 1.0,
    medium: 0.90,
    low: 0.75,
  } as Record<string, number>,

  // ── Health status thresholds ────────────────────────────────────────────────

  healthStatusThresholds: {
    excellent: 85,
    good: 70,
    moderate: 50,
    poor: 25,
  },

  // ── Set-level health formula ────────────────────────────────────────────────

  setLevelHealth: {
    minWeight: 0.55,
    avgWeight: 0.45,
  },

  // ── Alert thresholds ────────────────────────────────────────────────────────

  alerts: {
    lowRemainingKm: 3000,
    criticalRemainingKm: 1000,
    unevenWearAttentionMm: 0.6,
    unevenWearCriticalMm: 1.0,
    frontRearRotationDeltaMm: 1.2,
    lowConfidenceThreshold: 55,
  },

  // ── Rotation review ─────────────────────────────────────────────────────────

  rotationReview: {
    normalReviewKm: 12000,
    urbanHeavyReviewKm: 10000,
    overdueKm: 15000,
    wearImbalanceThresholdMm: 0.8,
  },

  // ── Staggered setup ─────────────────────────────────────────────────────────

  staggered: {
    widthLifeAdjustmentPer10mm: 0.03,
    referenceWidthMm: 205,
    minLifeMultiplier: 0.75,
    maxLifeMultiplier: 1.15,
    restrictedRotationTemplates: ['cross', 'full_rotation'] as string[],
    allowedRotationTemplates: ['front_to_rear', 'side_swap_only', 'same_axle_swap'] as string[],
  },

  // ── Regen braking factors (EV/HEV only) ────────────────────────────────────

  regenFactors: {
    ev: { FWD: { front: 0.80, rear: 0.92 }, RWD: { front: 0.92, rear: 0.78 }, AWD: { front: 0.84, rear: 0.84 }, default: { front: 0.82, rear: 0.82 } } as Record<string, { front: number; rear: number }>,
    hybrid: { FWD: { front: 0.88, rear: 0.96 }, RWD: { front: 0.96, rear: 0.86 }, AWD: { front: 0.90, rear: 0.90 }, default: { front: 0.90, rear: 0.90 } } as Record<string, { front: number; rear: number }>,
    ice: { front: 1.0, rear: 1.0 },
  },

  // ── Regression model ──────────────────────────────────────────────────────

  regression: {
    minDataPointsForRegression: 8,
    minDataPointsForHighConfidence: 20,
    regressionBlendStartPoints: 5,
    regressionBlendFullPoints: 15,
    maxResidualForGoodFit: 0.5,
    outlierStdDevThreshold: 2.5,
    minDistanceKmBetweenPoints: 200,
    maxTreadJumpMm: 2.0,
  },

  // ── Canonical tread STATUS bands (mm-based, season-aware) ─────────────────
  //
  // These drive the honest GOOD/WATCH/WARNING/CRITICAL status surfaced to the
  // UI, Fleet Condition, VehicleHealth and the tire alert detector. They are
  // intentionally separate from `replaceThresholds` (which the wear MODEL uses
  // for remaining-km / operational-replacement math) — status is about road
  // safety, the model is about projection. Legal minimum is always CRITICAL.
  //
  //   GOOD     : tread >  good
  //   WATCH    : watch <  tread <= good
  //   WARNING  : warning(=legal 1.6) < tread <= watch
  //   CRITICAL : tread <= legalMinTreadMm (1.6)
  treadStatusBands: {
    SUMMER: { good: 4.0, watch: 3.0 },
    ALL_SEASON: { good: 4.0, watch: 3.0 },
    WINTER: { good: 5.0, watch: 4.0 },
    TRACK: { good: 4.0, watch: 3.0 },
    OTHER: { good: 4.0, watch: 3.0 },
  } as Record<string, { good: number; watch: number }>,

  defaultTreadStatusBand: { good: 4.0, watch: 3.0 },

  // ── Confidence level (HIGH/MEDIUM/LOW/UNKNOWN) day/km gates ────────────────
  // A real measurement that is recent → HIGH; older but still plausible →
  // MEDIUM; no recent measurement (pure estimate) → LOW; no usable data →
  // UNKNOWN. Centralised so the read model and the detector agree.
  confidenceLevels: {
    highMaxMeasurementAgeDays: 30,
    highMaxKmSinceMeasurement: 3000,
    mediumMaxMeasurementAgeDays: 180,
    mediumMaxKmSinceMeasurement: 15000,
  },

  // ── Measurement freshness / overdue ───────────────────────────────────────
  measurementFreshness: {
    overdueDays: 180,
    staleDays: 365,
  },

  // ── Tire age (DOT) ────────────────────────────────────────────────────────
  // Rubber ages regardless of tread. 6y → advisory, 10y → strong replace hint.
  tireAge: {
    warnYears: 6,
    criticalYears: 10,
  },

  // ── Season (month-based) status ───────────────────────────────────────────
  // Encapsulated so weather/temperature can later replace the simple month
  // windows without touching consumers. Northern-hemisphere DACH default:
  // winter season = Oct–Mar (O.b.i.s.O. rule territory), summer = May–Sep.
  seasonCalendar: {
    winterMonths: [10, 11, 12, 1, 2, 3], // 1-based months
    summerMonths: [5, 6, 7, 8, 9],
  },

  snapshotIntervalDays: 1,
  recalculationCooldownMs: 60000,
} as const;

export type TireHealthConfig = typeof TIRE_HEALTH_CONFIG;

/**
 * Normalize a tire dimension string for comparison.
 * Strips whitespace, lowercases, removes non-alphanumeric/slash/dot chars.
 */
export function normalizeDimension(dim: string | null | undefined): string {
  if (!dim) return '';
  return dim.trim().toLowerCase().replace(/[^a-z0-9/.]/g, '');
}

/** Detect staggered setup: setup.isStaggered flag OR differing normalized dimensions. */
export function isStaggeredSetup(setup: {
  isStaggered?: boolean;
  frontDimension?: string | null;
  rearDimension?: string | null;
}): boolean {
  if (setup.isStaggered) return true;
  const f = normalizeDimension(setup.frontDimension);
  const r = normalizeDimension(setup.rearDimension);
  return f.length > 0 && r.length > 0 && f !== r;
}

/**
 * Safely parse AI tire spec JSON from Prisma.
 * Applies tire_v2 normalizer range rules on read (invalid → null); does not mutate stored JSON.
 */
export function parseAiTireSpec(raw: unknown): AiTireSpec | null {
  return parseValidatedAiTireSpecFromStorage(raw);
}

/**
 * Resolve archetype from AI spec or season fallback.
 * Mapping is conservative: defaults to 'default' when unsure.
 */
export function resolveArchetype(spec: AiTireSpec | null, season: string | null): TireArchetype {
  if (spec?.tireArchetype) {
    const normalized = spec.tireArchetype.toLowerCase().replace(/[\s-]/g, '_');
    if (normalized in TIRE_HEALTH_CONFIG.archetypeDefaults) return normalized as TireArchetype;
  }
  if (spec?.evOptimized) return 'ev_optimized';
  if (spec?.runFlat) return 'run_flat';
  if (spec?.vehicleClassFit === 'van' || spec?.vehicleClassFit === 'commercial') return 'van_commercial';
  if (spec?.intendedUse === 'sport' || spec?.intendedUse === 'track') return 'sport';
  if (spec?.intendedUse === 'eco' || spec?.intendedUse === 'economy') return 'eco';
  if (spec?.intendedUse === 'touring') return 'touring';
  if (spec?.intendedUse === 'comfort') return 'comfort';
  if (season === 'WINTER') return 'winter_non_studded';
  return 'default';
}

/**
 * Resolve reference new tread depth with strict source priority.
 * NEVER used as current tread for already-mounted used tires.
 */
export function resolveReferenceNewTread(
  manualInitialFront: number | null,
  manualInitialRear: number | null,
  manualInitialDepth: number | null,
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): { front: number; rear: number; source: NewTreadRefSource } {
  const manualFront = manualInitialFront ?? manualInitialDepth;
  const manualRear = manualInitialRear ?? manualInitialDepth;
  if (manualFront != null && manualRear != null) {
    return { front: manualFront, rear: manualRear, source: 'manual_confirmed' };
  }

  if (spec?.newTreadDepthMm != null && spec.newTreadDepthMm > 4 && spec.newTreadDepthMm <= 16) {
    const val = spec.newTreadDepthMm;
    return { front: manualFront ?? val, rear: manualRear ?? val, source: 'ai_spec' };
  }

  const arch = TIRE_HEALTH_CONFIG.archetypeDefaults[archetype] ?? TIRE_HEALTH_CONFIG.archetypeDefaults['default'];
  if (archetype !== 'default') {
    return { front: manualFront ?? arch.newTreadMm, rear: manualRear ?? arch.newTreadMm, source: 'archetype_default' };
  }

  const fallback = TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm;
  return { front: manualFront ?? fallback, rear: manualRear ?? fallback, source: 'season_fallback' };
}

/**
 * Resolve operational replacement threshold with source priority.
 * Prefers: spec operational > spec recommended > season/archetype > legal minimum.
 */
export function resolveReplacementThreshold(
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): { mm: number; source: ReplacementThresholdSource } {
  if (spec?.operationalReplacementDepthMm != null && spec.operationalReplacementDepthMm >= 1.6) {
    return { mm: spec.operationalReplacementDepthMm, source: 'spec_operational' };
  }
  if (spec?.recommendedReplacementDepthMm != null && spec.recommendedReplacementDepthMm >= 1.6) {
    return { mm: spec.recommendedReplacementDepthMm, source: 'spec_recommended' };
  }
  const arch = TIRE_HEALTH_CONFIG.archetypeDefaults[archetype];
  if (arch) {
    return { mm: arch.replaceMm, source: 'season_fallback' };
  }
  const seasonThreshold = TIRE_HEALTH_CONFIG.replaceThresholds[season ?? 'ALL_SEASON'] ?? TIRE_HEALTH_CONFIG.defaultReplaceThresholdMm;
  return { mm: seasonThreshold, source: 'season_fallback' };
}

/**
 * Derive model-aware expected life from archetype + spec sensitivities.
 * Falls back to season-based defaults when spec is absent.
 */
export function resolveExpectedLifeKm(
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
  existingExpectedLife: number | null,
): number {
  if (existingExpectedLife != null && existingExpectedLife > 0) return existingExpectedLife;

  const arch = TIRE_HEALTH_CONFIG.archetypeDefaults[archetype] ?? TIRE_HEALTH_CONFIG.archetypeDefaults['default'];
  let life = arch.expectedLifeKm;

  const longevity = spec?.longevityBias ?? arch.longevityBias;
  life = Math.round(life * longevity);

  if (spec?.xl || spec?.reinforced) life = Math.round(life * 1.05);
  if (spec?.evOptimized) life = Math.round(life * 1.03);

  const seasonCfg = TIRE_HEALTH_CONFIG.expectedLifeKm[season ?? 'ALL_SEASON'];
  if (seasonCfg) {
    life = Math.max(seasonCfg.min, Math.min(seasonCfg.max, life));
  }

  return life;
}
