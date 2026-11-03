import {
  computeAlignmentClassificationStability,
  computeTheilSenDirectionSign,
} from '../ds4-rpm-shadow-correlation-alignment-envelope.v1';
import {
  classifyEventContextFromTemporalSupport,
  computeEventTemporalSupportV1,
  localEventCadenceCoarserThanVsiTierNominal,
  parseHalfOpenEventWindowMs,
} from '../ds4-rpm-shadow-correlation-event-temporal-support.v1';

function iso(sec: number): string {
  return new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

describe('ds4-rpm-shadow-correlation PR2328 scientific hardening', () => {
  describe('local event cadence vs VSI trip tier', () => {
    it('RPM_1S trip with regular 2s local spacing cannot be AVAILABLE even when gapDeficiency=0', () => {
      const window = parseHalfOpenEventWindowMs(iso(1_000_000), iso(1_000_006))!;
      const points = [0, 2, 4, 6].map((s) => ({
        ms: (1_000_000 + s) * 1000,
        value: 1500 + s,
      }));
      const support = computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: points,
        cadenceTier: 'RPM_1S',
      });
      expect(support.gapDeficiencySeconds).toBe(0);
      expect(support.effectiveInterPointCadenceSeconds).toBe(2);
      expect(
        localEventCadenceCoarserThanVsiTierNominal({
          authoritativeCadenceTier: 'RPM_1S',
          effectiveInterPointCadenceSeconds: support.effectiveInterPointCadenceSeconds,
          effectiveCadenceSource: support.effectiveCadenceSource,
        }),
      ).toBe(true);
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

    it('RPM_2S trip with regular 2s spacing may be AVAILABLE when gapDeficiency=0', () => {
      const window = parseHalfOpenEventWindowMs(iso(1_000_000), iso(1_000_006))!;
      const points = [0, 2, 4, 6].map((s) => ({
        ms: (1_000_000 + s) * 1000,
        value: 1500 + s,
      }));
      const support = computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: points,
        cadenceTier: 'RPM_2S',
      });
      expect(support.gapDeficiencySeconds).toBe(0);
      expect(
        classifyEventContextFromTemporalSupport({
          hasValueConflicts: false,
          hasDuplicateTimestamps: false,
          temporalSupport: support,
          eventDurationMs: window.durationMs,
          defensibleCadenceAllowed: true,
        }),
      ).toBe('AVAILABLE');
    });

    it('mixed cadence (1s then 3s gap) stays PARTIAL on RPM_1S', () => {
      const window = parseHalfOpenEventWindowMs(iso(1_000_000), iso(1_000_008))!;
      const points = [
        { ms: 1_000_000_000, value: 1000 },
        { ms: 1_000_001_000, value: 1010 },
        { ms: 1_000_004_000, value: 1040 },
        { ms: 1_000_005_000, value: 1050 },
      ];
      const support = computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: points,
        cadenceTier: 'RPM_1S',
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

    it('missing intermediate 1s samples yields PARTIAL on RPM_1S despite endpoints', () => {
      const window = parseHalfOpenEventWindowMs(iso(1_000_000), iso(1_000_005))!;
      const points = [
        { ms: 1_000_000_000, value: 1000 },
        { ms: 1_000_004_000, value: 1040 },
      ];
      const support = computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: points,
        cadenceTier: 'RPM_1S',
      });
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
  });

  describe('Theil–Sen direction semantics', () => {
    it('endpoint outlier at start does not flip median slope sign', () => {
      const series = [
        { tMs: 0, valueRpm: 500 },
        { tMs: 1000, valueRpm: 1010 },
        { tMs: 2000, valueRpm: 1020 },
        { tMs: 3000, valueRpm: 1030 },
      ];
      const r = computeTheilSenDirectionSign({ series, hasValueConflicts: false });
      expect(r.robustDirectionSign).toBe('INCREASING');
    });

    it('is invariant to shuffled input order', () => {
      const series = [
        { tMs: 3000, valueRpm: 1030 },
        { tMs: 0, valueRpm: 1000 },
        { tMs: 2000, valueRpm: 1020 },
        { tMs: 1000, valueRpm: 1010 },
      ];
      const r = computeTheilSenDirectionSign({ series, hasValueConflicts: false });
      expect(r.robustDirectionSign).toBe('INCREASING');
    });
  });

  describe('alignment direction envelope stability', () => {
    it('does not report direction stability when all offsets abstain', () => {
      const stability = computeAlignmentClassificationStability({
        diagnostics: [
          {
            offsetSeconds: -2,
            classification: 'UNAVAILABLE',
            robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
          },
          {
            offsetSeconds: 0,
            classification: 'UNAVAILABLE',
            robustDirectionSign: 'ABSTAIN_INSUFFICIENT_SUPPORT',
          },
        ],
      });
      expect(stability.directionSignStableAcrossEnvelope).toBe(false);
      expect(stability.directionSignEnvelopeStability).toBe('NOT_ASSESSABLE');
    });
  });

  describe('coverage semantics fields', () => {
    it('documents gapDeficiency zero is not physical sensor coverage proof', () => {
      const window = parseHalfOpenEventWindowMs(iso(1_000_000), iso(1_000_006))!;
      const support = computeEventTemporalSupportV1({
        window,
        pointsInHalfOpenWindow: [0, 2, 4, 6].map((s) => ({
          ms: (1_000_000 + s) * 1000,
          value: 1000 + s * 10,
        })),
        cadenceTier: 'RPM_2S',
      });
      expect(support.gapDeficiencySeconds).toBe(0);
      expect(support.gapDeficiencyZeroSemantics).toBe(
        'ZERO_OBSERVATION_SPACING_VS_LOCAL_CADENCE_NOT_PHYSICAL_SENSOR_COVERAGE',
      );
      expect(support.rpmObservationSupportWidthSeconds).toBe('UNKNOWN');
      expect(support.missingIntervalSecondsInWindow).toBe(support.gapDeficiencySeconds);
      expect(support.missingIntervalSecondsInWindowAliasSemantics).toContain('LEGACY_ALIAS');
    });
  });
});
