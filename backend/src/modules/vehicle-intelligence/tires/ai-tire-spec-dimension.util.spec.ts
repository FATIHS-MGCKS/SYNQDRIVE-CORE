import {
  parseMetricTireSizeRaw,
  tireSizeRawMatchesTriple,
} from './ai-tire-spec-dimension.util';

describe('ai-tire-spec-dimension.util', () => {
  it('parses metric tire size raw', () => {
    expect(parseMetricTireSizeRaw('225/45R17')).toEqual({
      widthMm: 225,
      aspectRatio: 45,
      rimDiameterInch: 17,
    });
  });

  it('detects triple mismatch', () => {
    expect(tireSizeRawMatchesTriple('225/45R17', 235, 45, 17)).toBe(false);
    expect(tireSizeRawMatchesTriple('225/45R17', 225, 45, 17)).toBe(true);
  });
});
