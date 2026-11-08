import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { buildTierTripClassification } from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS } from '../ds4-rpm-episode-research.contract.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../ds4-rpm-episode-research.kernel.v1';
import {
  API_SYNTHETIC_DIMO,
  buildBoundResearchInput,
  rpmAtU,
} from './ds4-rpm-episode-research.test-helpers';

describe('ds4-rpm-episode-research Opus remediation', () => {
  it('P1-1 BEV non-APPLICABLE abstains on ICE_APPLICABILITY_NOT_ADMITTED', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
        iceRpmApplicability: 'NOT_APPLICABLE',
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('ICE_APPLICABILITY_NOT_ADMITTED');
  });

  it.each([
    ['ORGANIZATION_ID_MISMATCH', (i: ReturnType<typeof buildBoundResearchInput>) => { i.organizationId = 'wrong-org'; }],
    ['PROVIDER_SOURCE_LINK_MISMATCH', (i) => { i.providerSourceLinkId = 'wrong-link'; }],
    ['V1B_INPUT_FINGERPRINT_MISMATCH', (i) => { i.v1bResult!.inputFingerprint = 'deadbeef'; }],
  ])('P1-1 BEV with %s -> ABSTAINED', (code, mutate) => {
    const input = buildBoundResearchInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
      iceRpmApplicability: 'NOT_APPLICABLE',
    });
    mutate(input);
    const out = computeDs4RpmEpisodeResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain(code);
  });

  it('P1-2 collapses Z and +00:00 to one epoch label', () => {
    const t = Date.parse('2026-01-01T10:00:01.000Z');
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: new Date(t).toISOString(), valueRpm: rpmAtU(0.7) },
          { recordedAtIso: '2026-01-01T10:00:01.000+00:00', valueRpm: rpmAtU(0.7) },
          ...buildRpmPointsEverySeconds('2026-01-01T10:00:02.000Z', 4, 1).map((p) => ({
            ...p,
            valueRpm: rpmAtU(0.7),
          })),
        ],
      }),
    );
    expect(out.denominators.observedUniqueLabelCount).toBe(5);
    expect(out.denominators.identicalDuplicateCollapsedCount).toBe(1);
    expect(out.highEpisodes.items[0]?.providerBucketLabelStartIso).toMatch(/Z$/);
  });

  it('P1-2 same epoch conflicting rpm -> NOT_ASSESSABLE episodes', () => {
    const t = Date.parse('2026-01-01T10:00:01.000Z');
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: new Date(t).toISOString(), valueRpm: rpmAtU(0.7) },
          { recordedAtIso: '2026-01-01T10:00:01.000+00:00', valueRpm: rpmAtU(0.4) },
          ...buildRpmPointsEverySeconds('2026-01-01T10:00:02.000Z', 6, 1).map((p) => ({
            ...p,
            valueRpm: rpmAtU(0.7),
          })),
        ],
      }),
    );
    expect(out.denominators.conflictingDuplicateLabelCount).toBe(1);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
  });

  it('P1-3 caps exceedance grid and preserves exact max', () => {
    const rpm = 5_000_000;
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [{ recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: rpm }],
      }),
    );
    expect(out.absoluteDistribution.countWeightedQuantiles.max).toBe(rpm);
    expect(out.absoluteDistribution.exceedanceCounts250.length).toBeLessThanOrEqual(
      DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS,
    );
    expect(out.absoluteDistribution.exceedanceGridTruncated).toBe(true);
    expect(out.absoluteDistribution.exceedanceGridTruncationReason).toBe(
      'OBSERVED_MAX_RPM_EXCEEDS_EXCEEDANCE_GRID_CAP',
    );
  });

  it('P2-1 test helper resolves API_SYNTHETIC', () => {
    expect(resolveTelemetrySourceFamily(API_SYNTHETIC_DIMO)).toBe('API_SYNTHETIC');
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1) }),
    );
    expect(out.bindings.telemetrySourceFamily).toBe('API_SYNTHETIC');
  });

  it('P2-2 excludes negative RPM from statistics', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: [
          { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: -100 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 0 },
          ...buildRpmPointsEverySeconds('2026-01-01T10:00:03.000Z', 5, 1).map((p) => ({
            ...p,
            valueRpm: rpmAtU(0.7),
          })),
        ],
      }),
    );
    expect(out.denominators.negativeOrNonFiniteRpmExcludedCount).toBe(1);
    expect(out.denominators.observedUniqueLabelCount).toBe(6);
    expect(out.absoluteDistribution.countWeightedQuantiles.q50).toBeGreaterThan(0);
  });

  it('P2-3 I5 NOT_APPLICABLE when no u>1', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 6, 1).map((p) => ({
          ...p,
          valueRpm: rpmAtU(0.7),
        })),
      }),
    );
    expect(out.highEpisodes.massAccounting?.highCoreAboveReferenceMaxStatus).toBe('NOT_APPLICABLE');
  });

  it('invariants I3 and I4 on nested near-max fixture', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 9, 1).map((p, i) => ({
          ...p,
          valueRpm: rpmAtU(i < 3 || i >= 7 ? 0.7 : 0.92),
        })),
      }),
    );
    expect(out.highEpisodes.massAccounting?.i3SameCategoryEpisodeRangesDisjoint).toBe(true);
    expect(out.highEpisodes.massAccounting?.i4Satisfied).toBe(true);
  });

  it('binding abstains on OBSERVATION_ONLY analysis mode', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_3S' }),
    });
    const tierOut = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: new Date('2026-01-01T11:00:00.000Z'),
      existingSucceededFingerprint: null,
    });
    expect(tierOut.kind).toBe('SUCCEEDED');
    if (tierOut.kind !== 'SUCCEEDED') return;
    const out = computeDs4RpmEpisodeResearchV1({
      ...buildBoundResearchInput({ rpmPoints: points }),
      tripInput,
      v1bResult: tierOut.result,
    });
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('V1B_ANALYSIS_MODE_NOT_ELIGIBLE');
  });

  it('binding abstains on incomplete ClickHouse read', () => {
    const input = buildBoundResearchInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
    });
    input.tripInput.dataQuality.completenessLabel = 'INCOMPLETE_MORE_POINTS_AVAILABLE';
    const out = computeDs4RpmEpisodeResearchV1(input);
    expect(out.abstainReasons).toContain('HF_READ_INCOMPLETE');
  });

  it('binding abstains on cross-tenant organization mismatch', () => {
    const input = buildBoundResearchInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1),
    });
    input.organizationId = 'tenant-a';
    input.tripInput.organizationId = 'tenant-b';
    const out = computeDs4RpmEpisodeResearchV1(input);
    expect(out.abstainReasons).toContain('ORGANIZATION_ID_MISMATCH');
  });
});
