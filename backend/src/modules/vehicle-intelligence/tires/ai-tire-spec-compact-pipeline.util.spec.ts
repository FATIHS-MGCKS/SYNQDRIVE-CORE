import { resolveArchetype } from './tire-health.config';
import { parseValidatedAiTireSpecFromStorage } from './ai-tire-spec-read.util';
import { normalizeAiTireSpecResult } from './ai-tire-spec-normalizer';
import {
  applyCompactEvidenceGate,
  applyAuthoritativeIdentityToCompactSpec,
  processAiTireSpecCompactLlmOutput,
  reconcileCompactArchetypeMarks,
  reconcileCompactTireDimensions,
} from './ai-tire-spec-compact-pipeline.util';
import { AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS } from './ai-tire-spec-canonical.contract';
import { validatePayloadIdentityAgainstSetup } from './ai-tire-spec-payload-identity.util';
import { TireSetupStatus } from '@prisma/client';

const ctx = {
  brand: 'Michelin',
  model: 'Pilot Sport 4',
  tireSize: '225/45R17',
  loadIndex: '94',
  speedIndex: 'Y',
};

describe('processAiTireSpecCompactLlmOutput', () => {
  it('materializes all 24 compact keys', () => {
    const out = processAiTireSpecCompactLlmOutput({}, ctx);
    expect(Object.keys(out).sort()).toEqual([...AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS].sort());
    expect(out.loadIndex).toBe('94');
    expect(out.tireSizeRaw).toBe('225/45R17');
    expect(out.widthMm).toBe(225);
  });

  it('nulls dimension triple on raw contradiction', () => {
    const { spec, dimensionContradiction } = reconcileCompactTireDimensions({
      tireSizeRaw: '225/45R17',
      widthMm: 235,
      aspectRatio: 45,
      rimDiameterInch: 17,
    });
    expect(dimensionContradiction).toBe(true);
    expect(spec.tireSizeRaw).toBeNull();
    expect(spec.widthMm).toBeNull();
  });

  it('strips unverified optional EU/UTQG fields (fail-closed)', () => {
    const out = processAiTireSpecCompactLlmOutput(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        euWetGripClass: 'A',
        utqgTreadwear: 320,
        oeHomologation: 'MO',
      },
      ctx,
    );
    expect(out.euWetGripClass).toBeNull();
    expect(out.utqgTreadwear).toBeNull();
    expect(out.oeHomologation).toBeNull();
  });

  it('nulls newTreadDepthMm for knowledge-only LLM even when identity aligns', () => {
    const out = processAiTireSpecCompactLlmOutput(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        newTreadDepthMm: 8.2,
      },
      ctx,
    );
    expect(out.newTreadDepthMm).toBeNull();
  });

  it('keeps newTreadDepthMm only with catalogNominalTreadEvidence and full identity match', () => {
    const out = processAiTireSpecCompactLlmOutput(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        tireSizeRaw: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        newTreadDepthMm: 8.2,
      },
      ctx,
      { catalogNominalTreadEvidence: true },
    );
    expect(out.newTreadDepthMm).toBe(8.2);
  });

  it('nulls newTreadDepthMm when brand/model diverge from context', () => {
    const out = applyCompactEvidenceGate(
      {
        matchedBrand: 'Other',
        matchedModel: 'Pilot Sport 4',
        tireSizeRaw: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        newTreadDepthMm: 8.2,
      },
      ctx,
    );
    expect(out.newTreadDepthMm).toBeNull();
  });

  it('nulls contradictory tireArchetype instead of overriding marks', () => {
    const out = reconcileCompactArchetypeMarks({
      tireArchetype: 'touring',
      runFlat: true,
    });
    expect(out.tireArchetype).toBeNull();
    expect(out.runFlat).toBe(true);
    expect(resolveArchetype(normalizeAiTireSpecResult(out), 'SUMMER')).toBe('run_flat');
  });

  it('preserves historical tire_v2 blob reads with excluded sensitivities', () => {
    const parsed = parseValidatedAiTireSpecFromStorage({
      schemaVersion: 'tire_v2',
      matchedBrand: 'Michelin',
      aggressiveDrivingSensitivity: 0.9,
      heatSensitivity: 0.5,
      newTreadDepthMm: 8,
      loadIndex: '94',
      speedIndex: 'Y',
      tireSizeRaw: '225/45R17',
    });
    expect(parsed?.aggressiveDrivingSensitivity).toBe(0.9);
    expect(parsed?.newTreadDepthMm).toBe(8);
  });

  it('supports unified axle binding after compact processing', () => {
    const spec = normalizeAiTireSpecResult(
      processAiTireSpecCompactLlmOutput(
        {
          matchedBrand: 'Michelin',
          matchedModel: 'Pilot Sport 4',
        },
        ctx,
      ),
    );
    const setup = {
      id: 's1',
      vehicleId: 'v1',
      status: TireSetupStatus.ACTIVE,
      removedAt: null,
      frontDimension: '225/45R17',
      rearDimension: '225/45R17',
      loadIndexFront: '94',
      loadIndexRear: '94',
      speedIndexFront: 'Y',
      speedIndexRear: 'Y',
      updatedAt: new Date(),
    };
    const r = validatePayloadIdentityAgainstSetup(spec, setup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindingScope).toBe('setup_wide');
  });
});

describe('applyAuthoritativeIdentityToCompactSpec', () => {
  it('overrides LLM identity with request context', () => {
    const out = applyAuthoritativeIdentityToCompactSpec(
      { loadIndex: '91', tireSizeRaw: '255/40R18' },
      ctx,
    );
    expect(out.loadIndex).toBe('94');
    expect(out.tireSizeRaw).toBe('225/45R17');
  });
});

describe('applyCompactEvidenceGate', () => {
  it('clears optional values without full authoritative context', () => {
    const out = applyCompactEvidenceGate(
      { euWetGripClass: 'A', evOptimized: true, newTreadDepthMm: 8 },
      {},
    );
    expect(out.euWetGripClass).toBeNull();
    expect(out.evOptimized).toBeNull();
    expect(out.newTreadDepthMm).toBeNull();
  });
});
