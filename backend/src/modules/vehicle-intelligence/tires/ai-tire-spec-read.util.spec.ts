import { parseValidatedAiTireSpecFromStorage } from './ai-tire-spec-read.util';
import { parseAiTireSpec } from './tire-health.config';

describe('parseValidatedAiTireSpecFromStorage', () => {
  it('nulls invalid historical newTreadDepthMm without dropping valid fields', () => {
    const raw = {
      schemaVersion: 'tire_v2',
      matchedBrand: 'Michelin',
      newTreadDepthMm: 80,
      widthMm: 225,
      aspectRatio: 45,
      rimDiameterInch: 17,
      loadIndex: '94',
      speedIndex: 'Y',
    };
    const parsed = parseValidatedAiTireSpecFromStorage(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.newTreadDepthMm).toBeNull();
    expect(parsed!.widthMm).toBe(225);
    expect(parsed!.matchedBrand).toBe('Michelin');
  });

  it('delegates parseAiTireSpec through read validation', () => {
    const raw = { newTreadDepthMm: 999, maxInflationKpa: 350 };
    expect(parseAiTireSpec(raw)?.newTreadDepthMm).toBeNull();
  });

  it('rejects out-of-range legacy threshold aliases on read', () => {
    const parsed = parseValidatedAiTireSpecFromStorage({
      legalMinTreadDepthMm: 0.5,
      practicalReplacementDepthMm: 25,
    });
    expect(parsed!.legalMinimumMm).toBeNull();
    expect(parsed!.recommendedReplacementDepthMm).toBeNull();
  });

  it('preserves metadata flags without trusting invalid numerics', () => {
    const parsed = parseValidatedAiTireSpecFromStorage({
      userConfirmedSpec: true,
      specSourceType: 'ai_agent',
      confidenceScore: 150,
    });
    expect(parsed!.userConfirmedSpec).toBe(true);
    expect(parsed!.specSourceType).toBe('ai_agent');
    expect(parsed!.confidenceScore).toBeNull();
  });

  it('preserves manufacturer source URLs on read when stored', () => {
    const parsed = parseValidatedAiTireSpecFromStorage({
      matchedBrand: 'Michelin',
      manufacturerSourceUrl: 'https://example.com/mfg',
      labelSourceUrl: 'https://example.com/label',
    });
    expect(parsed!.manufacturerSourceUrl).toBe('https://example.com/mfg');
    expect(parsed!.labelSourceUrl).toBe('https://example.com/label');
  });
});
