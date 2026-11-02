import type { AiTireSpec } from './tire-health.config';
import { mapAiTireSpecLegacyAliases } from './ai-tire-spec-legacy-alias.util';
import { normalizeAiTireSpecResult } from './ai-tire-spec-normalizer';
import { normalizeTireSpecConfidenceScore } from './ai-tire-spec-confidence.util';

const METADATA_KEYS = new Set([
  'userConfirmedSpec',
  'specSourceType',
  'fetchedAt',
  'jobId',
  'normalizedAt',
  'tireSpecConfidence',
  'schemaVersion',
]);

const LEGACY_THRESHOLD_KEYS = new Set([
  'legalMinimumMm',
  'legalMinTreadDepthMm',
  'recommendedReplacementDepthMm',
  'practicalReplacementDepthMm',
  'operationalReplacementDepthMm',
  'winterRecommendedMinDepthMm',
]);

/** Legacy wear-policy depths from pre-normalization blobs — not AI tire_v2 outputs. */
function parseLegacyThresholdMm(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  if (n < 1.6 || n > 20) return null;
  return n;
}

function readMetadataBool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

function readMetadataString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function hasNonMetadataContent(obj: Record<string, unknown>): boolean {
  return Object.entries(obj).some(
    ([k, v]) => v != null && !METADATA_KEYS.has(k) && !LEGACY_THRESHOLD_KEYS.has(k),
  );
}

/**
 * Read path: apply tire_v2 normalizer ranges to stored blobs without DB mutation.
 * Invalid numeric/enum values become null (fail-closed for technical fields).
 */
export function parseValidatedAiTireSpecFromStorage(raw: unknown): AiTireSpec | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const aliased = mapAiTireSpecLegacyAliases(obj);
  if (!aliased) return null;

  if (!hasNonMetadataContent(aliased) && !hasLegacyThresholdContent(aliased)) {
    const metaOnly = readMetadataBool(obj.userConfirmedSpec);
    if (metaOnly == null && obj.specSourceType == null) return null;
  }

  const normalized = normalizeAiTireSpecResult(aliased);

  return {
    ...normalized,
    legalMinimumMm: parseLegacyThresholdMm(
      aliased.legalMinimumMm ?? aliased.legalMinTreadDepthMm,
    ),
    recommendedReplacementDepthMm: parseLegacyThresholdMm(
      aliased.recommendedReplacementDepthMm ?? aliased.practicalReplacementDepthMm,
    ),
    operationalReplacementDepthMm: parseLegacyThresholdMm(
      aliased.operationalReplacementDepthMm ?? aliased.winterRecommendedMinDepthMm,
    ),
    userConfirmedSpec: readMetadataBool(obj.userConfirmedSpec),
    specSourceType: readMetadataString(obj.specSourceType),
    confidenceScore:
      normalized.confidenceScore ??
      normalizeTireSpecConfidenceScore(obj.tireSpecConfidence) ??
      normalizeTireSpecConfidenceScore(obj.confidenceScore),
    manufacturerSourceUrl: readMetadataString(obj.manufacturerSourceUrl),
    labelSourceUrl: readMetadataString(obj.labelSourceUrl),
  };
}

function hasLegacyThresholdContent(obj: Record<string, unknown>): boolean {
  return (
    obj.legalMinimumMm != null ||
    obj.legalMinTreadDepthMm != null ||
    obj.recommendedReplacementDepthMm != null ||
    obj.practicalReplacementDepthMm != null ||
    obj.operationalReplacementDepthMm != null ||
    obj.winterRecommendedMinDepthMm != null
  );
}
