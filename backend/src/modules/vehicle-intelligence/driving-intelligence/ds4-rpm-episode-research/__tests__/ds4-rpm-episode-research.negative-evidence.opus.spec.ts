import { computeDs4RpmEpisodeResearchV1 } from '../ds4-rpm-episode-research.kernel.v1';
import { buildBoundResearchInput, rpmAtU } from './ds4-rpm-episode-research.test-helpers';

describe('P2-A1 negative evidence safety (Opus P1-01)', () => {
  it('fragmented high-RPM pairs yield NOT_ASSESSABLE not NOT_OBSERVED', () => {
    const baseMs = Date.parse('2026-01-01T10:00:01.000Z');
    const rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }> = [];
    for (let seg = 0; seg < 8; seg += 1) {
      for (let j = 0; j < 2; j += 1) {
        const t = baseMs + seg * 5000 + j * 1000;
        rpmPoints.push({
          recordedAtIso: new Date(t).toISOString(),
          valueRpm: rpmAtU(0.76),
        });
      }
    }
    for (let i = 0; i < 8; i += 1) {
      rpmPoints.push({
        recordedAtIso: new Date(baseMs + 40000 + i * 1000).toISOString(),
        valueRpm: rpmAtU(0.35),
      });
    }
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints }));
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
    expect(out.highEpisodes.items).toHaveLength(0);
    expect(out.highEpisodes.rejectedCandidateCount).toBeGreaterThan(0);
  });

  it('contiguous high-RPM evidence still yields SUPPORTED_DESCRIPTIVE', () => {
    const baseMs = Date.parse('2026-01-01T10:00:01.000Z');
    const rpmPoints = Array.from({ length: 12 }, (_, i) => ({
      recordedAtIso: new Date(baseMs + i * 1000).toISOString(),
      valueRpm: rpmAtU(0.76),
    }));
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints }));
    expect(out.highEpisodes.status).toBe('SUPPORTED_DESCRIPTIVE');
    expect(out.highEpisodes.items.length).toBeGreaterThan(0);
  });

  it('adequately sampled cruise without high episode remains NOT_OBSERVED', () => {
    const baseMs = Date.parse('2026-01-01T10:00:01.000Z');
    const rpmPoints = Array.from({ length: 30 }, (_, i) => ({
      recordedAtIso: new Date(baseMs + i * 1000).toISOString(),
      valueRpm: rpmAtU(0.4),
    }));
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints }));
    expect(out.highEpisodes.status).toBe('NOT_OBSERVED');
    expect(out.highEpisodes.rejectedCandidateCount).toBe(0);
  });
});
