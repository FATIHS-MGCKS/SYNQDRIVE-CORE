import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import type { Ds4RpmEpisodeResearchBindingAbstainReason } from '../ds4-rpm-episode-research.contract.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../ds4-rpm-episode-research.kernel.v1';
import {
  buildBoundResearchInput,
  buildRpmPointsEverySeconds,
  rpmAtU,
} from './ds4-rpm-episode-research.test-helpers';

const applicableHighRpm = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 12, 1).map(
  (p, i) => ({ ...p, valueRpm: rpmAtU(i >= 2 && i < 10 ? 0.75 : 0.3) }),
);

const ref = (ice: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN') =>
  buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
    idleRpm: 800,
    maxRpm: 6800,
    idleRpmProvenance: { category: 'USER_CONFIRMED' },
    maxRpmProvenance: { category: 'USER_CONFIRMED' },
    iceRpmApplicability: ice,
  });

function expectAbstainWith(
  out: ReturnType<typeof computeDs4RpmEpisodeResearchV1>,
  codes: Ds4RpmEpisodeResearchBindingAbstainReason[],
) {
  expect(out.status).toBe('ABSTAINED');
  for (const c of codes) {
    expect(out.abstainReasons).toContain(c);
  }
}

describe('ds4-rpm-episode-research ICE applicability parity', () => {
  it('A=B=C=APPLICABLE → eligible for computation', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: applicableHighRpm }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.highEpisodes.status).toBe('SUPPORTED_DESCRIPTIVE');
  });

  it('A=B=APPLICABLE, C=NOT_APPLICABLE → ABSTAINED REFERENCE_CONFLICT', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: applicableHighRpm,
        reference: ref('NOT_APPLICABLE'),
      }),
    );
    expectAbstainWith(out, ['ICE_APPLICABILITY_REFERENCE_CONFLICT']);
    expect(out.abstainReasons).not.toContain('ICE_APPLICABILITY_NOT_ADMITTED');
  });

  it('A=B=APPLICABLE, C=UNKNOWN → ABSTAINED REFERENCE_CONFLICT', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: applicableHighRpm,
        reference: ref('UNKNOWN'),
      }),
    );
    expectAbstainWith(out, ['ICE_APPLICABILITY_REFERENCE_CONFLICT']);
  });

  it('A=C=APPLICABLE, B=NOT_APPLICABLE → ABSTAINED V1B_MISMATCH', () => {
    const input = buildBoundResearchInput({ rpmPoints: applicableHighRpm });
    input.v1bResult!.admission.iceRpmApplicability = 'NOT_APPLICABLE';
    const out = computeDs4RpmEpisodeResearchV1(input);
    expectAbstainWith(out, ['ICE_APPLICABILITY_V1B_MISMATCH']);
  });

  it('A=B=C=UNKNOWN → ABSTAINED NOT_ADMITTED', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: applicableHighRpm, iceRpmApplicability: 'UNKNOWN' }),
    );
    expectAbstainWith(out, ['ICE_APPLICABILITY_NOT_ADMITTED']);
  });

  it('A=B=C=NOT_APPLICABLE → ABSTAINED NOT_ADMITTED', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({ rpmPoints: applicableHighRpm, iceRpmApplicability: 'NOT_APPLICABLE' }),
    );
    expectAbstainWith(out, ['ICE_APPLICABILITY_NOT_ADMITTED']);
  });

  it('forced processingAllowed=true with non-APPLICABLE ICE → ABSTAINED', () => {
    const input = buildBoundResearchInput({
      rpmPoints: applicableHighRpm,
      iceRpmApplicability: 'NOT_APPLICABLE',
    });
    input.tripInput.admission.processingAllowed = true;
    input.v1bResult!.admission.processingAllowed = true;
    const out = computeDs4RpmEpisodeResearchV1(input);
    expectAbstainWith(out, ['ICE_APPLICABILITY_NOT_ADMITTED']);
  });

  it('trip processingAllowed=false with APPLICABLE ICE → TRIP_ADMISSION_NOT_ALLOWED', () => {
    const input = buildBoundResearchInput({ rpmPoints: applicableHighRpm });
    input.tripInput.admission.processingAllowed = false;
    const out = computeDs4RpmEpisodeResearchV1(input);
    expectAbstainWith(out, ['TRIP_ADMISSION_NOT_ALLOWED']);
  });

  it('AI_ESTIMATED reference provenance: absolute COMPLETE, episodes trust-gated', () => {
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints: applicableHighRpm,
        reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 800,
          maxRpm: 6800,
          idleRpmProvenance: { category: 'AI_ESTIMATED' },
          maxRpmProvenance: { category: 'AI_ESTIMATED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.absoluteDistribution.status).toBe('COMPLETE');
    expect(out.referenceContext.normalizedEpisodesEligible).toBe(false);
    expect(out.highEpisodes.status).toBe('NOT_ASSESSABLE');
  });
});
