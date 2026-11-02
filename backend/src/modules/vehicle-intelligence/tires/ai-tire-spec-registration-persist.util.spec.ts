import { buildNormalizedRegistrationAiTireSpecJson } from './ai-tire-spec-registration-persist.util';

describe('ai-tire-spec-registration-persist', () => {
  it('normalizes raw aiTireSpec with schemaVersion tire_v3_compact', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        tireSizeRaw: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        newTreadDepthMm: 7.8,
        euWetGripClass: 'A',
      },
      null,
    );
    expect(json).not.toBeNull();
    const blob = json as Record<string, unknown>;
    expect(blob.schemaVersion).toBe('tire_v3_compact');
    expect(blob.userConfirmedSpec).toBe(false);
    expect(blob.matchedBrand).toBe('Michelin');
    expect(blob.euWetGripClass).toBeNull();
    expect(blob.newTreadDepthMm).toBeNull();
  });

  it('applies authoritative registration tire identity over LLM fields', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      {
        matchedBrand: 'Audi',
        matchedModel: 'A4',
        tireSizeRaw: '255/40R18',
        loadIndex: '99',
        speedIndex: 'W',
        newTreadDepthMm: 9,
      },
      null,
      {
        brandModelFront: 'Michelin Pilot Sport 4',
        frontDimension: '225/45R17',
        loadIndexFront: '94',
        speedIndexFront: 'Y',
      },
    );
    expect(json).not.toBeNull();
    const blob = json as Record<string, unknown>;
    expect(blob.matchedBrand).toBe('Michelin');
    expect(blob.matchedModel).toBe('Pilot Sport 4');
    expect(blob.tireSizeRaw).toBe('225/45R17');
    expect(blob.loadIndex).toBe('94');
    expect(blob.speedIndex).toBe('Y');
    expect(blob.newTreadDepthMm).toBeNull();
  });

  it('skips overwrite when existing spec is user confirmed', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      { matchedBrand: 'Other' },
      { userConfirmedSpec: true, matchedBrand: 'OEM' },
    );
    expect(json).toBeNull();
  });
});
