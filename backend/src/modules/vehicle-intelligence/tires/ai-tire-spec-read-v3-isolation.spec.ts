import { resolveReplacementThreshold, resolveArchetype, parseAiTireSpec } from './tire-health.config';

/**
 * P0: invalid stored AI numerics must not alter V3 replacement/archetype resolution paths.
 */
describe('ai tire spec read validation — V3 input isolation', () => {
  it('does not use out-of-range newTreadDepthMm from raw storage', () => {
    const spec = parseAiTireSpec({
      newTreadDepthMm: 80,
      tireArchetype: 'STANDARD_TOURING',
      seasonType: 'summer',
    });
    expect(spec!.newTreadDepthMm).toBeNull();

    const archetype = resolveArchetype(spec, 'SUMMER');
    const threshold = resolveReplacementThreshold(spec, archetype, 'SUMMER');
    expect(threshold.mm).toBeGreaterThan(0);
    expect(threshold.mm).toBeLessThan(10);
  });
});
