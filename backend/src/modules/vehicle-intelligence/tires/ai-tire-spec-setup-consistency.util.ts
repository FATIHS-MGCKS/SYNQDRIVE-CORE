import type { AiTireSpec } from './tire-health.config';
import {
  buildSetupAxleIdentityTuples,
  jobMatchesSetupAxleIdentity,
  normalizeLoadSpeedIndex,
  normalizeTireSizeForCompare,
} from './ai-tire-spec-job-binding.util';

export type AiTireSpecSetupConflictCode =
  | 'SEASON_MISMATCH'
  | 'AXLE_IDENTITY_MISMATCH';

export interface AiTireSpecSetupConflict {
  code: AiTireSpecSetupConflictCode;
  message: string;
  setupValue: string | null;
  specValue: string | null;
  /** Manual setup or user-confirmed spec wins; AI blob must not silently override setup columns. */
  precedence: 'setup_manual' | 'spec_user_confirmed';
}

export interface TireSetupSpecConsistencyInput {
  tireSeason: string | null;
  frontDimension: string | null;
  rearDimension: string | null;
  loadIndexFront: string | null;
  loadIndexRear: string | null;
  speedIndexFront: string | null;
  speedIndexRear: string | null;
}

export function toTireSetupSpecConsistencyInput(setup: {
  tireSeason?: string | null;
  frontDimension?: string | null;
  rearDimension?: string | null;
  loadIndexFront?: string | null;
  loadIndexRear?: string | null;
  speedIndexFront?: string | null;
  speedIndexRear?: string | null;
}): TireSetupSpecConsistencyInput {
  return {
    tireSeason: setup.tireSeason ?? null,
    frontDimension: setup.frontDimension ?? null,
    rearDimension: setup.rearDimension ?? null,
    loadIndexFront: setup.loadIndexFront ?? null,
    loadIndexRear: setup.loadIndexRear ?? null,
    speedIndexFront: setup.speedIndexFront ?? null,
    speedIndexRear: setup.speedIndexRear ?? null,
  };
}

const SPEC_SEASON_TO_SETUP: Record<string, string> = {
  summer: 'SUMMER',
  winter: 'WINTER',
  all_season: 'ALL_SEASON',
};

function setupSeasonNormalized(season: string | null | undefined): string | null {
  if (!season) return null;
  return season.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function specSeasonNormalized(spec: AiTireSpec): string | null {
  if (!spec.seasonType) return null;
  const key = spec.seasonType.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SPEC_SEASON_TO_SETUP[key] ?? null;
}

export function resolveSpecTireSizeRaw(spec: AiTireSpec): string | null {
  const raw = spec.tireSizeRaw?.trim();
  if (raw) return raw;
  const { widthMm, aspectRatio, rimDiameterInch } = spec;
  if (widthMm != null && aspectRatio != null && rimDiameterInch != null) {
    return `${widthMm}/${aspectRatio}R${rimDiameterInch}`;
  }
  return null;
}

function formatSetupAxleSummary(setup: TireSetupSpecConsistencyInput): string | null {
  const tuples = buildSetupAxleIdentityTuples(setup);
  if (tuples.length === 0) return null;
  return tuples
    .map((t) => `${t.dimension} ${t.loadIndex}${t.speedIndex}`)
    .join(' | ');
}

function formatSpecAxleSummary(spec: AiTireSpec): string | null {
  const size = resolveSpecTireSizeRaw(spec);
  const load = normalizeLoadSpeedIndex(spec.loadIndex);
  const speed = normalizeLoadSpeedIndex(spec.speedIndex);
  if (!size || !load || !speed) return null;
  return `${normalizeTireSizeForCompare(size)} ${load}${speed}`;
}

/**
 * Detect conflicts between setup columns (manual truth) and AI spec blob.
 * Does not mutate setup or spec; callers report conflicts on apply/read.
 */
export function detectAiTireSpecSetupConflicts(
  setup: TireSetupSpecConsistencyInput,
  spec: AiTireSpec | null,
): AiTireSpecSetupConflict[] {
  if (!spec) return [];

  const conflicts: AiTireSpecSetupConflict[] = [];
  const userConfirmed = spec.userConfirmedSpec === true;
  const precedence: AiTireSpecSetupConflict['precedence'] = userConfirmed
    ? 'spec_user_confirmed'
    : 'setup_manual';

  const setupSeason = setupSeasonNormalized(setup.tireSeason);
  const fromSpecSeason = specSeasonNormalized(spec);
  if (setupSeason && fromSpecSeason && setupSeason !== fromSpecSeason) {
    conflicts.push({
      code: 'SEASON_MISMATCH',
      message: 'Setup tire season differs from AI spec seasonType',
      setupValue: setupSeason,
      specValue: fromSpecSeason,
      precedence,
    });
  }

  const tireSizeRaw = resolveSpecTireSizeRaw(spec);
  const loadIndex = spec.loadIndex?.trim();
  const speedIndex = spec.speedIndex?.trim();
  if (tireSizeRaw && loadIndex && speedIndex) {
    const setupTuples = buildSetupAxleIdentityTuples(setup);
    if (setupTuples.length > 0) {
      const matches = jobMatchesSetupAxleIdentity(
        { tireSize: tireSizeRaw, loadIndex, speedIndex },
        setup,
      );
      if (!matches) {
        conflicts.push({
          code: 'AXLE_IDENTITY_MISMATCH',
          message:
            'AI spec size/load/speed does not match any complete setup axle identity',
          setupValue: formatSetupAxleSummary(setup),
          specValue: formatSpecAxleSummary(spec),
          precedence,
        });
      }
    }
  }

  return conflicts;
}

export function partitionSetupSpecConflicts(conflicts: AiTireSpecSetupConflict[]): {
  blocking: AiTireSpecSetupConflict[];
  warnings: AiTireSpecSetupConflict[];
} {
  const blocking: AiTireSpecSetupConflict[] = [];
  const warnings: AiTireSpecSetupConflict[] = [];
  for (const c of conflicts) {
    if (c.code === 'SEASON_MISMATCH') warnings.push(c);
    else blocking.push(c);
  }
  return { blocking, warnings };
}
