import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  computeWindowRelativeGapMetrics,
  parseHalfOpenEventWindowMs,
  translateHalfOpenWindowAndPoints,
} from '../ds4-rpm-shadow-correlation-event-temporal-support.v1';

function iso(sec: number): string {
  return new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

describe('ds4-rpm-shadow-correlation C1 epoch-parity reproduction and correction', () => {
  const B2 = 1_000_000;

  function classifyRegular2sSeries(startSec: number, endLabelSec: number, phaseSec: number) {
    const window = parseHalfOpenEventWindowMs(iso(startSec), iso(endLabelSec))!;
    const pts: Array<{ ms: number; value: number }> = [];
    for (let t = phaseSec - 40; t < phaseSec + 200; t += 2) {
      const ms = t * 1000;
      if (ms >= window.startMs && ms < window.endExclusiveMs) {
        pts.push({ ms, value: 1500 + t });
      }
    }
    const support = computeEventTemporalSupportV1({
      window,
      pointsInHalfOpenWindow: pts,
      cadenceTier: 'RPM_2S',
    });
    const cls = classifyEventContextFromTemporalSupport({
      hasValueConflicts: false,
      hasDuplicateTimestamps: false,
      temporalSupport: support,
      eventDurationMs: window.durationMs,
      defensibleCadenceAllowed: true,
    });
    return { cls, gap: support.gapDeficiencySeconds, pts: pts.length };
  }

  it('reproduces pre-fix parity asymmetry on legacy epoch-grid metric (documented)', () => {
    const legacyEpochMissing = (startSec: number, endLabelSec: number, phaseSec: number): number => {
      const window = parseHalfOpenEventWindowMs(iso(startSec), iso(endLabelSec))!;
      const bucketWidthMs = 2000;
      const winStart = window.startMs;
      const winEnd = window.endExclusiveMs;
      const firstBucket = Math.floor(winStart / bucketWidthMs);
      const lastBucket = Math.floor((winEnd - 1) / bucketWidthMs);
      const pts: number[] = [];
      for (let t = phaseSec - 40; t < phaseSec + 200; t += 2) {
        const ms = t * 1000;
        if (ms >= winStart && ms < winEnd) pts.push(ms);
      }
      let missingMs = 0;
      for (let b = firstBucket; b <= lastBucket; b += 1) {
        const bucketStart = b * bucketWidthMs;
        const bucketEnd = bucketStart + bucketWidthMs;
        const overlapStart = Math.max(winStart, bucketStart);
        const overlapEnd = Math.min(winEnd, bucketEnd);
        if (overlapEnd <= overlapStart) continue;
        const hasPoint = pts.some((p) => p >= overlapStart && p < overlapEnd);
        if (!hasPoint) missingMs += overlapEnd - overlapStart;
      }
      return missingMs / 1000;
    };

    expect(legacyEpochMissing(B2, B2 + 3, B2)).toBe(0);
    expect(legacyEpochMissing(B2 + 1, B2 + 4, B2)).toBeGreaterThan(0);
  });

  it('window-relative gap model yields identical AVAILABLE for parity-shifted windows', () => {
    const even = classifyRegular2sSeries(B2, B2 + 3, B2);
    const odd = classifyRegular2sSeries(B2 + 1, B2 + 4, B2);
    expect(even.gap).toBe(0);
    expect(odd.gap).toBe(0);
    expect(even.cls).toBe('AVAILABLE');
    expect(odd.cls).toBe('AVAILABLE');
  });

  it.each([0, 1, 2])('joint translation invariance for start residue mod 3 (RPM_3S)', (startOff) => {
    const B3 = 999_999;
    const window = parseHalfOpenEventWindowMs(iso(B3 + startOff), iso(B3 + startOff + 5))!;
    const points: Array<{ ms: number; value: number }> = [];
    for (let t = B3; t < B3 + 120; t += 3) {
      points.push({ ms: t * 1000, value: 1200 + t });
    }
    const inWindow = points.filter((p) => p.ms >= window.startMs && p.ms < window.endExclusiveMs);
    const base = classifyEventContextFromTemporalSupport({
      hasValueConflicts: false,
      hasDuplicateTimestamps: false,
      temporalSupport: computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: inWindow,
        cadenceTier: 'RPM_3S',
      }),
      eventDurationMs: window.durationMs,
      defensibleCadenceAllowed: true,
    });

    const translated = translateHalfOpenWindowAndPoints({
      window,
      points: inWindow,
      deltaMs: 3600_000,
    });
    const translatedCls = classifyEventContextFromTemporalSupport({
      hasValueConflicts: false,
      hasDuplicateTimestamps: false,
      temporalSupport: computeEventTemporalSupportV1({
        window: translated.window,
        pointsInHalfOpenWindow: translated.points,
        cadenceTier: 'RPM_3S',
      }),
      eventDurationMs: translated.window.durationMs,
      defensibleCadenceAllowed: true,
    });
    expect(translatedCls).toBe(base);
  });

  it('irregular series with internal gap beyond observed cadence is PARTIAL', () => {
    const window = parseHalfOpenEventWindowMs(iso(B2), iso(B2 + 8))!;
    const pts = [
      { ms: B2 * 1000, value: 1000 },
      { ms: (B2 + 2) * 1000, value: 1100 },
      { ms: (B2 + 8) * 1000, value: 1200 },
    ];
    const support = computeEventTemporalSupportV1({
      window,
      pointsInHalfOpenWindow: pts,
      cadenceTier: 'RPM_2S',
    });
    expect(support.gapDeficiencySeconds).toBeGreaterThan(0);
    expect(
      classifyEventContextFromTemporalSupport({
        hasValueConflicts: false,
        hasDuplicateTimestamps: false,
        temporalSupport: support,
        eventDurationMs: window.durationMs,
        defensibleCadenceAllowed: true,
      }),
    ).toBe('PARTIAL');
  });

  it('computeWindowRelativeGapMetrics uses observed median cadence, not tier nominal alone', () => {
    const window = parseHalfOpenEventWindowMs(iso(B2), iso(B2 + 10))!;
    const sorted = [(B2 + 1) * 1000, (B2 + 4) * 1000, (B2 + 7) * 1000];
    const metrics = computeWindowRelativeGapMetrics({
      window,
      sortedPointsMs: sorted,
      cadenceTier: 'RPM_1S',
    });
    expect(metrics.effectiveInterPointCadenceSeconds).toBe(3);
    expect(metrics.effectiveCadenceSource).toBe('OBSERVED_MEDIAN_IN_WINDOW');
  });
});
