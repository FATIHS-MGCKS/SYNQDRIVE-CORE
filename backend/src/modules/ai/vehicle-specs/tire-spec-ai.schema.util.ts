import {
  AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS,
  AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
} from '../../vehicle-intelligence/tires/ai-tire-spec-canonical.contract';

export interface TireSpecContext {
  brand?: string;
  model?: string;
  year?: number;
  tireSize?: string;
  loadIndex?: string;
  speedIndex?: string;
}

export const TIRE_SPEC_FIELD_KEYS = [...AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS] as const;

const BOOL_KEYS = new Set([
  'runFlat',
  'reinforced',
  'xl',
  'severeSnowMarked',
  'iceMarked',
  'evOptimized',
]);

const INTEGER_KEYS = new Set(['utqgTreadwear', 'euExternalNoiseDb']);

const NUMBER_KEYS = new Set([
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'newTreadDepthMm',
]);

function nullable(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

export function buildTireSpecEmptyShape(): Record<string, string | number | boolean | null> {
  const empty: Record<string, string | number | boolean | null> = {
    schemaVersion: AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
  };
  for (const key of TIRE_SPEC_FIELD_KEYS) {
    empty[key] = null;
  }
  return empty;
}

export function buildTireSpecJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    schemaVersion: {
      type: 'string',
      enum: [AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION],
    },
  };

  for (const key of TIRE_SPEC_FIELD_KEYS) {
    if (BOOL_KEYS.has(key)) {
      properties[key] = nullable({ type: 'boolean' });
      continue;
    }
    if (INTEGER_KEYS.has(key)) {
      properties[key] = nullable({ type: 'integer' });
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (key === 'euRollingResistanceClass' || key === 'euWetGripClass' || key === 'euExternalNoiseClass') {
      properties[key] = nullable({
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'E'],
      });
      continue;
    }
    if (key === 'seasonType') {
      properties[key] = nullable({
        type: 'string',
        enum: ['summer', 'winter', 'all_season'],
      });
      continue;
    }
    properties[key] = nullable({ type: 'string' });
  }

  return {
    type: 'object',
    properties,
    required: ['schemaVersion', ...TIRE_SPEC_FIELD_KEYS],
    additionalProperties: false,
  };
}

export function buildTireSpecPrompt(context: TireSpecContext): { system: string; user: string } {
  const ctxLines = [
    context.brand ? `TIRE_BRAND: ${context.brand}` : '',
    context.model ? `TIRE_MODEL: ${context.model}` : '',
    context.year ? `VEHICLE_YEAR: ${context.year}` : '',
    context.tireSize ? `TIRE_SIZE: ${context.tireSize}` : '',
    context.loadIndex ? `LOAD_INDEX: ${context.loadIndex}` : '',
    context.speedIndex ? `SPEED_INDEX: ${context.speedIndex}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const system = `You are an OEM tire specification extraction engine.
Return ONLY JSON matching the provided strict schema (schemaVersion=${AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION}).
Use null when a value is unknown or not verifiable — never invent specifications.
Do NOT output legal minimum tread, replacement policy thresholds, sensitivity/bias scores, or URLs.
Do NOT output confidenceScore — the platform assigns match quality separately.
Knowledge-only lookup from brand/model/size — no live vehicle telemetry.`;

  const user = `Tire context:
${ctxLines}

Fill verifiable tire specifications for this exact tire identity.
Rules:
- All schema keys must be present; use null for unknown values
- tireSizeRaw and loadIndex/speedIndex must match the provided TIRE_SIZE / LOAD_INDEX / SPEED_INDEX when given
- newTreadDepthMm: always null from this knowledge agent (nominal depth requires independent catalog proof; never infer from memory)
- Optional EU/UTQG/OE fields: null unless you are certain for this exact variant (never guess)
- tireArchetype: null if unsure; do not contradict runFlat / evOptimized sidewall marks
- Do not output excluded legacy fields (biases, UTQG traction/temp, max inflation, etc.)`;

  return { system, user };
}

export function parseTireSpecJson(
  parsed: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const result = buildTireSpecEmptyShape();
  if (!parsed || typeof parsed !== 'object') return result;

  for (const key of TIRE_SPEC_FIELD_KEYS) {
    if (key in parsed && parsed[key] !== undefined) {
      result[key] = parsed[key] as string | number | boolean | null;
    }
  }

  return result;
}
