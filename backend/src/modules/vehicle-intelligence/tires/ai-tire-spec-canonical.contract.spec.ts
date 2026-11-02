import {
  AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS,
  AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION,
  AI_TIRE_SPEC_LLM_FIELD_KEYS,
} from './ai-tire-spec-canonical.contract';
import {
  TIRE_SPEC_FIELD_KEYS,
  buildTireSpecEmptyShape,
  buildTireSpecJsonSchema,
} from '../../ai/vehicle-specs/tire-spec-ai.schema.util';
import { AI_TIRE_SPEC_NORMALIZER_INPUT_KEYS } from './ai-tire-spec-normalizer';

describe('ai-tire-spec canonical contract', () => {
  it('compact LLM schema exposes 24 nullable fields plus schemaVersion', () => {
    expect(TIRE_SPEC_FIELD_KEYS).toHaveLength(24);
    expect([...TIRE_SPEC_FIELD_KEYS].sort()).toEqual(
      [...AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS].sort(),
    );
  });

  it('normalizer still accepts legacy 50-field read surface', () => {
    expect([...AI_TIRE_SPEC_NORMALIZER_INPUT_KEYS].sort()).toEqual(
      [...AI_TIRE_SPEC_LLM_FIELD_KEYS].sort(),
    );
    expect(AI_TIRE_SPEC_LLM_FIELD_KEYS).toHaveLength(50);
  });

  it('strict JSON schema requires all compact keys and forbids extras', () => {
    const schema = buildTireSpecJsonSchema() as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('schemaVersion');
    expect(schema.required.length).toBe(25);
    expect(Object.keys(schema.properties).sort()).toEqual(schema.required.sort());
    expect(buildTireSpecEmptyShape().schemaVersion).toBe(AI_TIRE_SPEC_V3_COMPACT_SCHEMA_VERSION);
  });

  it('does not request policy thresholds, biases, or URL evidence from the model', () => {
    const schema = buildTireSpecJsonSchema() as { properties: Record<string, unknown> };
    const keys = Object.keys(schema.properties);
    expect(keys).not.toContain('legalMinTreadDepthMm');
    expect(keys).not.toContain('manufacturerSourceUrl');
    expect(keys).not.toContain('comfortBias');
    expect(keys).not.toContain('confidenceScore');
  });
});
