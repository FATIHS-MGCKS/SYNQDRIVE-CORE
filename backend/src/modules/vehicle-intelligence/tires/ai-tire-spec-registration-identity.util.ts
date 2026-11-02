import type { AiTireSpecAuthoritativeIdentityContext } from './ai-tire-spec-compact-pipeline.util';

/** Tire-side identity available at registration (not vehicle make/model). */
export interface RegistrationTireIdentityInput {
  brandModelFront?: string | null;
  frontDimension?: string | null;
  loadIndexFront?: string | null;
  speedIndexFront?: string | null;
}

/**
 * Split setup "brand model" line into tire brand + model (first token / remainder).
 * Does not invent missing tokens.
 */
export function splitTireBrandModelLine(
  brandModelFront: string | null | undefined,
): { brand: string | null; model: string | null } {
  const line = brandModelFront?.trim() ?? '';
  if (!line) return { brand: null, model: null };
  const parts = line.split(/\s+/);
  const brand = parts[0] ?? null;
  const model = parts.slice(1).join(' ') || null;
  return { brand, model };
}

export function resolveRegistrationTireIdentityContext(
  input: RegistrationTireIdentityInput,
): AiTireSpecAuthoritativeIdentityContext {
  const { brand, model } = splitTireBrandModelLine(input.brandModelFront);
  return {
    brand,
    model,
    tireSize: input.frontDimension?.trim() || null,
    loadIndex: input.loadIndexFront?.trim() || null,
    speedIndex: input.speedIndexFront?.trim() || null,
  };
}
