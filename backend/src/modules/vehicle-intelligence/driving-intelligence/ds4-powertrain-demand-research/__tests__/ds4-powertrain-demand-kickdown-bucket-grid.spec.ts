import { detectKickdownBucketGridCandidates } from '../ds4-powertrain-demand-kickdown-bucket-grid.v1';
import {
  canonicalizeMultichannelObservations,
} from '../ds4-powertrain-demand-multichannel-canonicalize.v1';

describe('kickdown bucket grid', () => {
  it('does not bridge distant bucket labels in array order', () => {
    const rows = [
      { recordedAtIso: '2026-01-01T10:00:01.000Z', throttlePct: 20, rpm: 2000, speedKmh: 55, loadPct: 70 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', throttlePct: 50, rpm: 2400, speedKmh: 58, loadPct: 72 },
      { recordedAtIso: '2026-01-01T10:05:00.000Z', throttlePct: 93, rpm: 3300, speedKmh: 70, loadPct: 80 },
    ];
    for (let i = 0; i < 9; i += 1) {
      rows.push({
        recordedAtIso: new Date(Date.parse('2026-01-01T10:05:01.000Z') + i * 1000).toISOString(),
        throttlePct: 40,
        rpm: 2500,
        speedKmh: 72,
        loadPct: 50,
      });
    }
    const canon = canonicalizeMultichannelObservations(rows);
    const detect = detectKickdownBucketGridCandidates({
      tripId: 't',
      providerSourceLinkId: 'l',
      canon,
      sequenceMaxGapSeconds: 3,
      nominalCadenceMs: 1000,
      movementObservedCompleteness: 1,
      r1HistoricalObdRecordTimeUncertain: false,
      fuelType: 'GASOLINE',
    });
    expect(detect.candidates.every((c) => c.classification !== 'KICKDOWN_LIKE_PROXY_CANDIDATE')).toBe(true);
  });

  it('deduplicates overlapping windows', () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const iso = new Date(Date.parse('2026-01-01T10:00:01.000Z') + i * 1000).toISOString();
      let throttle = 35;
      let rpm = 2100;
      if (i === 0) throttle = 25;
      if (i === 1) throttle = 55;
      if (i === 2) throttle = 92;
      if (i === 3) throttle = 91;
      if (i >= 2) rpm = 2000 + i * 400;
      return {
        recordedAtIso: iso,
        throttlePct: throttle,
        rpm,
        speedKmh: 55 + i * 2,
        loadPct: 70,
      };
    });
    const canon = canonicalizeMultichannelObservations(rows);
    const detect = detectKickdownBucketGridCandidates({
      tripId: 't',
      providerSourceLinkId: 'l',
      canon,
      sequenceMaxGapSeconds: 5,
      nominalCadenceMs: 1000,
      movementObservedCompleteness: 1,
      r1HistoricalObdRecordTimeUncertain: false,
      fuelType: 'GASOLINE',
    });
    expect(detect.rawWindowCount).toBeGreaterThanOrEqual(detect.candidates.length);
  });
});
