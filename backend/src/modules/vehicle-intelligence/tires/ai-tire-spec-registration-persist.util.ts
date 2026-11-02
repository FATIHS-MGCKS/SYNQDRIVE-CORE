import type { Prisma } from '@prisma/client';
import { parseAiTireSpec } from './tire-health.config';
import {
  buildPersistedAiTireSpec,
  normalizeAiTireSpecResult,
  validateAiTireSpec,
} from './ai-tire-spec-normalizer';
import { processAiTireSpecCompactLlmOutput } from './ai-tire-spec-compact-pipeline.util';
import { AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION } from './ai-tire-spec-canonical.contract';
import {
  type RegistrationTireIdentityInput,
  resolveRegistrationTireIdentityContext,
} from './ai-tire-spec-registration-identity.util';

/**
 * Normalize registration/DIMO raw aiTireSpec before persistence.
 * Skips overwrite when an existing setup already has user-confirmed spec.
 */
export function buildNormalizedRegistrationAiTireSpecJson(
  raw: Record<string, unknown>,
  existingAiTireSpec: unknown,
  tireIdentity: RegistrationTireIdentityInput = {},
): Prisma.InputJsonValue | null {
  const existing = parseAiTireSpec(existingAiTireSpec);
  if (existing?.userConfirmedSpec === true) {
    return null;
  }

  const identityCtx = resolveRegistrationTireIdentityContext(tireIdentity);
  const compact = processAiTireSpecCompactLlmOutput(raw, identityCtx);
  const normalized = normalizeAiTireSpecResult(compact);
  const validation = validateAiTireSpec(normalized);
  if (!validation.hasStructuredData) {
    return null;
  }

  const persisted = buildPersistedAiTireSpec(normalized, {
    jobId: null,
    confidenceScore: normalized.confidenceScore ?? null,
    completedAt: new Date().toISOString(),
    specSourceType: 'ai_agent',
    userConfirmedSpec: false,
  });

  return {
    ...persisted,
    schemaVersion: AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
  } as Prisma.InputJsonValue;
}
