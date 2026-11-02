import {
  AI_TIRE_SPEC_V3_COMPACT_CORE_KEYS,
  AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS,
  AI_TIRE_SPEC_V3_COMPACT_OPTIONAL_KEYS,
} from './ai-tire-spec-canonical.contract';
import {
  formatMetricTireSize,
  parseMetricTireSizeRaw,
  tireSizeRawMatchesTriple,
} from './ai-tire-spec-dimension.util';
import { normalizeLoadSpeedIndex, normalizeTireSizeForCompare } from './ai-tire-spec-job-binding.util';

export interface AiTireSpecAuthoritativeIdentityContext {
  brand?: string | null;
  model?: string | null;
  tireSize?: string | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
}

export interface AiTireSpecCompactProcessOptions {
  /**
   * Independent tire-specific catalog/label proof for nominal new tread depth.
   * Knowledge-only LLM output must NEVER set this — only future EPREL/OCR/user attestation paths.
   */
  catalogNominalTreadEvidence?: boolean;
}

function normalizeCatalogToken(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickCompactShape(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS) {
    out[key] = key in raw ? raw[key] : null;
  }
  return out;
}

function hasAuthoritativeIdentity(ctx: AiTireSpecAuthoritativeIdentityContext): boolean {
  return Boolean(
    ctx.tireSize?.trim() &&
      ctx.loadIndex?.trim() &&
      ctx.speedIndex?.trim() &&
      ctx.brand?.trim() &&
      ctx.model?.trim(),
  );
}

/** Request/setup identity overrides LLM identity fields when context is complete. */
export function applyAuthoritativeIdentityToCompactSpec(
  spec: Record<string, unknown>,
  ctx: AiTireSpecAuthoritativeIdentityContext,
): Record<string, unknown> {
  const next = { ...spec };
  if (ctx.brand?.trim()) next.matchedBrand = ctx.brand.trim();
  if (ctx.model?.trim()) next.matchedModel = ctx.model.trim();
  if (ctx.loadIndex?.trim()) next.loadIndex = ctx.loadIndex.trim();
  if (ctx.speedIndex?.trim()) next.speedIndex = ctx.speedIndex.trim();
  if (ctx.tireSize?.trim()) {
    next.tireSizeRaw = normalizeTireSizeForCompare(ctx.tireSize);
    const parsed = parseMetricTireSizeRaw(next.tireSizeRaw as string);
    if (parsed) {
      next.widthMm = parsed.widthMm;
      next.aspectRatio = parsed.aspectRatio;
      next.rimDiameterInch = parsed.rimDiameterInch;
    }
  }
  return next;
}

/**
 * Derive missing size parts from tireSizeRaw; reject contradictory triple vs raw.
 * Returns null fields for inconsistent LLM-only contradictions (fail-closed).
 */
export function reconcileCompactTireDimensions(
  spec: Record<string, unknown>,
): { spec: Record<string, unknown>; dimensionContradiction: boolean } {
  const next = { ...spec };
  const raw = typeof next.tireSizeRaw === 'string' ? next.tireSizeRaw.trim() : '';
  const widthMm = typeof next.widthMm === 'number' ? next.widthMm : null;
  const aspectRatio = typeof next.aspectRatio === 'number' ? next.aspectRatio : null;
  const rimDiameterInch =
    typeof next.rimDiameterInch === 'number' ? next.rimDiameterInch : null;

  const parsedRaw = parseMetricTireSizeRaw(raw);
  const hasTriple = widthMm != null && aspectRatio != null && rimDiameterInch != null;

  if (parsedRaw && hasTriple && !tireSizeRawMatchesTriple(raw, widthMm, aspectRatio, rimDiameterInch)) {
    next.tireSizeRaw = null;
    next.widthMm = null;
    next.aspectRatio = null;
    next.rimDiameterInch = null;
    return { spec: next, dimensionContradiction: true };
  }

  if (parsedRaw && !hasTriple) {
    next.widthMm = parsedRaw.widthMm;
    next.aspectRatio = parsedRaw.aspectRatio;
    next.rimDiameterInch = parsedRaw.rimDiameterInch;
    next.tireSizeRaw = formatMetricTireSize(parsedRaw);
    return { spec: next, dimensionContradiction: false };
  }

  if (!parsedRaw && hasTriple) {
    next.tireSizeRaw = formatMetricTireSize({
      widthMm: widthMm!,
      aspectRatio: aspectRatio!,
      rimDiameterInch: rimDiameterInch!,
    });
    return { spec: next, dimensionContradiction: false };
  }

  return { spec: next, dimensionContradiction: false };
}

/** Null contradictory tireArchetype; preserve marks for resolveArchetype(). */
export function reconcileCompactArchetypeMarks(
  spec: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...spec };
  const archRaw = typeof next.tireArchetype === 'string' ? next.tireArchetype : null;
  if (!archRaw?.trim()) return next;

  const arch = archRaw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const runFlat = next.runFlat === true;
  const runFlatFalse = next.runFlat === false;
  const ev = next.evOptimized === true;
  const evFalse = next.evOptimized === false;

  if (arch === 'run_flat' && runFlatFalse) next.tireArchetype = null;
  if (arch === 'ev_optimized' && evFalse) next.tireArchetype = null;
  if (runFlat && arch !== 'run_flat') next.tireArchetype = null;
  if (ev && arch !== 'ev_optimized') next.tireArchetype = null;

  return next;
}

/**
 * Fail-closed evidence gate for compact LLM output (knowledge-only — no EPREL/OCR).
 * Identity alignment alone does not verify nominal new tread depth.
 */
export function applyCompactEvidenceGate(
  spec: Record<string, unknown>,
  ctx: AiTireSpecAuthoritativeIdentityContext,
  options: AiTireSpecCompactProcessOptions = {},
): Record<string, unknown> {
  const next = { ...spec };

  for (const key of AI_TIRE_SPEC_V3_COMPACT_OPTIONAL_KEYS) {
    next[key] = null;
  }

  const catalogOk = hasAuthoritativeIdentity(ctx);
  const allowNominalTread =
    options.catalogNominalTreadEvidence === true && catalogOk;

  if (!allowNominalTread) {
    next.newTreadDepthMm = null;
    return next;
  }

  const brandOk =
    normalizeCatalogToken(String(next.matchedBrand ?? '')) ===
    normalizeCatalogToken(ctx.brand ?? '');
  const modelOk =
    normalizeCatalogToken(String(next.matchedModel ?? '')) ===
    normalizeCatalogToken(ctx.model ?? '');
  const sizeOk =
    normalizeTireSizeForCompare(String(next.tireSizeRaw ?? '')) ===
    normalizeTireSizeForCompare(ctx.tireSize ?? '');
  const liOk =
    normalizeLoadSpeedIndex(String(next.loadIndex ?? '')) ===
    normalizeLoadSpeedIndex(ctx.loadIndex ?? '');
  const siOk =
    normalizeLoadSpeedIndex(String(next.speedIndex ?? '')) ===
    normalizeLoadSpeedIndex(ctx.speedIndex ?? '');

  if (!(brandOk && modelOk && sizeOk && liOk && siOk)) {
    next.newTreadDepthMm = null;
  }

  return next;
}

export function processAiTireSpecCompactLlmOutput(
  raw: Record<string, unknown> | null | undefined,
  ctx: AiTireSpecAuthoritativeIdentityContext = {},
  options: AiTireSpecCompactProcessOptions = {},
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    return pickCompactShape({});
  }

  let spec = pickCompactShape(raw);
  spec = applyAuthoritativeIdentityToCompactSpec(spec, ctx);
  const dim = reconcileCompactTireDimensions(spec);
  spec = dim.spec;
  spec = reconcileCompactArchetypeMarks(spec);
  spec = applyCompactEvidenceGate(spec, ctx, options);

  for (const key of AI_TIRE_SPEC_V3_COMPACT_CORE_KEYS) {
    if (!(key in spec)) spec[key] = null;
  }

  return spec;
}
