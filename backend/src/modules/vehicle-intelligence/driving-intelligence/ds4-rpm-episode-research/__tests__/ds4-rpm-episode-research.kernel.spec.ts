import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import {
  DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U,
  DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U,
} from '../ds4-rpm-episode-research.contract.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../ds4-rpm-episode-research.kernel.v1';
import {
  buildBoundResearchInput,
  buildRpmPointsEverySeconds,
  R1_DIMO,
  rpmAtU,
} from './ds4-rpm-episode-research.test-helpers';

const START = '2026-01-01T10:00:01.000Z';

function denseAtU(u: number, count: number, stepSec = 1): Array<{ recordedAtIso: string; valueRpm: number }> {
  const rpm = rpmAtU(u);
  return buildRpmPointsEverySeconds(START, count, stepSec).map((p) => ({ ...p, valueRpm: rpm }));
}

describe('ds4-rpm-episode-research kernel', () => {
  it('stable cruise u≈0.4 yields NOT_OBSERVED episodes', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: denseAtU(0.4, 8) }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.highEpisodes.status).toBe('NOT_OBSERVED');
    expect(out.highEpisodes.countRange.max).toBe(0);
  });

  it('rejects one- and two-point spikes (core < 3)', () => {
    const one = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          ...denseAtU(0.4, 3),
          { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: rpmAtU(0.7) },
          ...denseAtU(0.4, 3),
        ],
      }),
    );
    expect(one.highEpisodes.rejectedCandidateCount).toBeGreaterThanOrEqual(1);
    expect(one.highEpisodes.countRange.max).toBe(0);

    const two = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          ...denseAtU(0.4, 2),
          ...denseAtU(0.7, 2),
          ...denseAtU(0.4, 2),
        ],
      }),
    );
    expect(two.highEpisodes.countRange.max).toBe(0);
  });

  it('admits sustained elevated episode with corePointCount ≥ 3', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: denseAtU(0.7, 6) }),
    );
    expect(out.highEpisodes.status).toBe('SUPPORTED_DESCRIPTIVE');
    expect(out.highEpisodes.countRange.max).toBe(1);
    expect(out.highEpisodes.items[0]?.corePointCount).toBeGreaterThanOrEqual(3);
  });

  it('hysteresis dip keeps one episode and satisfies I2', () => {
    const points = [
      rpmAtU(0.7),
      rpmAtU(0.6),
      rpmAtU(0.6),
      rpmAtU(0.7),
      rpmAtU(0.7),
      rpmAtU(0.4),
    ].map((valueRpm, i) => ({
      recordedAtIso: new Date(Date.parse(START) + i * 1000).toISOString(),
      valueRpm,
    }));
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints: points }));
    expect(out.highEpisodes.countRange.max).toBe(1);
    const m = out.highEpisodes.massAccounting!;
    expect(m.high.i2Satisfied).toBe(true);
    expect(m.high.admittedCorePlusTailPointCount).toBeGreaterThan(m.high.eligibleCorePointCount);
  });

  it('splits episodes on sequence gap > maxGap', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          ...denseAtU(0.7, 4),
          ...buildRpmPointsEverySeconds('2026-01-01T10:00:10.000Z', 4, 1).map((p) => ({
            ...p,
            valueRpm: rpmAtU(0.75),
          })),
        ],
      }),
    );
    expect(out.highEpisodes.countRange.max).toBe(2);
  });

  it('threshold equality: entry inclusive, exit exclusive', () => {
    const exactEntry = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: denseAtU(DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U, 3) }),
    );
    expect(exactEntry.highEpisodes.countRange.max).toBe(1);

    const exitBand = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [0.58, 0.58, 0.58, 0.4].map((u, i) => ({
          recordedAtIso: new Date(Date.parse(START) + i * 1000).toISOString(),
          valueRpm: rpmAtU(u),
        })),
      }),
    );
    expect(exitBand.highEpisodes.countRange.max).toBe(0);
  });

  it('nested NEAR_MAX sub-episode inside HIGH', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 9, 1).map((p, i) => ({
          ...p,
          valueRpm: rpmAtU(i < 3 || i >= 7 ? 0.7 : 0.92),
        })),
      }),
    );
    expect(out.highEpisodes.items[0]?.nearMaxSubEpisodeCount).toBeGreaterThanOrEqual(1);
    expect(out.highEpisodes.massAccounting?.i4Satisfied).toBe(true);
  });

  it('input order invariance after canonical sort', () => {
    const base = [
      { recordedAtIso: '2026-01-01T10:00:03.000Z', valueRpm: rpmAtU(0.7) },
      { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: rpmAtU(0.7) },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: rpmAtU(0.7) },
      { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: rpmAtU(0.7) },
    ];
    const shuffled = [...base].reverse();
    const a = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints: base }));
    const b = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints: shuffled }));
    expect(a.highEpisodes.countRange).toEqual(b.highEpisodes.countRange);
    expect(a.absoluteDistribution.countWeightedQuantiles.q50).toBe(b.absoluteDistribution.countWeightedQuantiles.q50);
  });

  it('collapses identical duplicate labels', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 2000 },
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 2000 },
          ...buildRpmPointsEverySeconds('2026-01-01T10:00:02.000Z', 5, 1).map((p) => ({
            ...p,
            valueRpm: rpmAtU(0.7),
          })),
        ],
      }),
    );
    expect(out.denominators.identicalDuplicateCollapsedCount).toBe(1);
    expect(out.status).toBe('COMPUTED');
  });

  it('conflicting duplicate labels → episodes NOT_ASSESSABLE, distribution PARTIAL', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 2000 },
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 6500 },
          ...denseAtU(0.7, 6),
        ],
      }),
    );
    expect(out.denominators.conflictingDuplicateLabelCount).toBe(1);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
    expect(out.absoluteDistribution.status).toBe('PARTIAL');
    expect(out.absoluteDistribution.ambiguousLabelsExcluded).toBe(true);
  });

  it('AI-estimated reference withholds normalized episodes', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: denseAtU(0.7, 6),
        reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 800,
          maxRpm: 6800,
          idleRpmProvenance: { category: 'AI_ESTIMATED' },
          maxRpmProvenance: { category: 'AI_ESTIMATED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      }),
    );
    expect(out.referenceContext.normalizedEpisodesEligible).toBe(false);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
    expect(out.absoluteDistribution.status).toBe('COMPLETE');
  });

  it('reference observation conflict (≥3 labels u>1)', () => {
    const points = [
      ...buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 4, 1).map((p) => ({
        ...p,
        valueRpm: rpmAtU(1.05),
      })),
      ...buildRpmPointsEverySeconds('2026-01-01T10:00:06.000Z', 5, 1).map((p) => ({
        ...p,
        valueRpm: rpmAtU(0.7),
      })),
    ];
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints: points }));
    expect(out.referenceContext.referenceObservationConflict).toBe(true);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
  });

  it('PHEV insufficient rotating labels → ICE_OPERATION_UNPROVEN via NOT_ASSESSABLE episodes', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 0 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 0 },
          { recordedAtIso: '2026-01-01T10:00:03.000Z', valueRpm: 50 },
          { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: 50 },
        ],
      }),
    );
    expect(out.denominators.runningLabelCount).toBeLessThan(3);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
  });

  it('BEV ICE admission abstains fail-closed', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: denseAtU(0.7, 5),
        iceRpmApplicability: 'NOT_APPLICABLE',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('ICE_APPLICABILITY_NOT_ADMITTED');
  });

  it('R1 family marker without physical duration fields', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: denseAtU(0.7, 6), dimoVehicleRawJson: R1_DIMO }),
    );
    expect(out.r1HistoricalObdRecordTimeUncertain).toBe(true);
    expect(out.timeAuthority).toBe('BUCKET_LABEL_UNVERIFIED');
    expect(out.semanticGuards.misuseEligibility).toBe('NOT_EVALUATED_BY_DESIGN');
    expect(out.highEpisodes.items.every((e) => !('durationSeconds' in (e as object)))).toBe(true);
  });

  it('binding rejects fingerprint mismatch', () => {
    const input = buildBoundResearchInput({ rpmPoints: denseAtU(0.7, 6) });
    input.v1bResult!.inputFingerprint = 'deadbeef';
    const out = computeDs4RpmEpisodeResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_INPUT_FINGERPRINT_MISMATCH');
  });

  it('binding rejects cross-tenant org mismatch', () => {
    const input = buildBoundResearchInput({ rpmPoints: denseAtU(0.7, 6) });
    input.organizationId = 'other-org';
    const out = computeDs4RpmEpisodeResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('ORGANIZATION_ID_MISMATCH');
  });

  it('mass accounting I1 holds on adversarial u sequence', () => {
    const us = [0.4, 0.66, 0.6, 0.68, 0.55, 0.7, 0.7, 0.7, 0.7, 0.4];
    const points = us.map((u, i) => ({
      recordedAtIso: new Date(Date.parse(START) + i * 1000).toISOString(),
      valueRpm: rpmAtU(u),
    }));
    const out = computeDs4RpmEpisodeResearchV1(buildBoundResearchInput({ rpmPoints: points }));
    expect(out.highEpisodes.massAccounting?.high.i1Satisfied).toBe(true);
  });
});
