import { validateDs4RpmEpisodeResearchInputBinding } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.input-binding.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { validateDs4PowertrainDemandResearchInputBinding } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { isSoleInsufficientLoadLabelBindingFailure } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { canonicalizeMultichannelObservations } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { DbiP2c15IndependentExpectationV1 } from '../dbi-p2c15-binding-envelope.expectations.v1';
import { envelopeFromA1Input, envelopeFromPowertrainInput } from '../dbi-p2c15-binding-envelope.factories.v1';
import {
  buildDbiP2c15ScenarioPackage,
  DBI_P2C15_SCENARIO_IDS,
} from '../dbi-p2c15-binding-envelope.scenarios.v1';
import type {
  DbiP2c15ScenarioPackageV1,
  DbiP2c15ScenarioPayloadV1,
} from '../dbi-p2c15-binding-envelope.types.v1';
import type { Ds4PowertrainDemandResearchInputV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';

function powertrainPayloadInput(
  payload: DbiP2c15ScenarioPayloadV1,
): Ds4PowertrainDemandResearchInputV1 {
  if (payload.kind === 'POWERTRAIN_INPUT' || payload.kind === 'MODULE_SPECIFIC_SCENARIO') {
    return payload.input;
  }
  throw new Error(`expected powertrain payload, got ${payload.kind}`);
}

function assertPinMatchesPowertrainBinding(
  actual: ReturnType<typeof validateDs4PowertrainDemandResearchInputBinding>,
  pinned: Extract<DbiP2c15IndependentExpectationV1, { kind: 'POWERTRAIN_BINDING' }>,
): void {
  expect(actual.ok).toBe(pinned.bindingOk);
  if (!actual.ok) {
    for (const code of pinned.requiredAbstainReasons) {
      expect(actual.reasonCodes).toContain(code);
    }
    if (!pinned.allowAdditionalAbstainReasons) {
      expect([...actual.reasonCodes].sort()).toEqual([...pinned.requiredAbstainReasons].sort());
    }
  }
}

function assertPinMatchesA1Binding(
  actual: ReturnType<typeof validateDs4RpmEpisodeResearchInputBinding>,
  pinned: Extract<DbiP2c15IndependentExpectationV1, { kind: 'A1_BINDING' }>,
): void {
  expect(actual.ok).toBe(pinned.bindingOk);
  if (!actual.ok) {
    for (const code of pinned.requiredAbstainReasons) {
      expect(actual.reasonCodes).toContain(code);
    }
  }
}

function assertEnvelopeMatchesPayload(pack: DbiP2c15ScenarioPackageV1): void {
  if (pack.payload.kind === 'POWERTRAIN_INPUT' || pack.payload.kind === 'MODULE_SPECIFIC_SCENARIO') {
    const expected = envelopeFromPowertrainInput(pack.scenarioId, pack.payload.input);
    expect(pack.envelope).toEqual(expected);
  } else if (pack.payload.kind === 'A1_INPUT') {
    expect(pack.envelope).toEqual(envelopeFromA1Input(pack.scenarioId, pack.payload.input));
  } else if (pack.payload.kind === 'CANONICAL_ORDER_PAIR') {
    expect(pack.envelope).toEqual(
      envelopeFromPowertrainInput(pack.scenarioId, pack.payload.forwardInput),
    );
  }
}

describe('DBI P2-C1.5 binding envelope fixture library', () => {
  it.each(DBI_P2C15_SCENARIO_IDS)('%s exposes payload, envelope and pinned expectation', (scenarioId) => {
    const pack = buildDbiP2c15ScenarioPackage(scenarioId);
    expect(pack.scenarioId).toBe(scenarioId);
    expect(pack.payload).toBeDefined();
    expect(pack.envelope.sourceProvenanceVerified).toBe(false);
    assertEnvelopeMatchesPayload(pack);
    expect(pack.scientificNotes.length).toBeGreaterThan(0);
  });

  it('independent factory invocations do not share mutable input state', () => {
    const a = buildDbiP2c15ScenarioPackage('S06_V1B_FINGERPRINT_TAMPER');
    const b = buildDbiP2c15ScenarioPackage('S06_V1B_FINGERPRINT_TAMPER');
    expect(a.payload.kind).toBe('POWERTRAIN_INPUT');
    expect(b.payload.kind).toBe('POWERTRAIN_INPUT');
    expect(powertrainPayloadInput(a.payload)).not.toBe(powertrainPayloadInput(b.payload));
    const tampered = 'mutated-after-factory';
    powertrainPayloadInput(a.payload).organizationId = tampered;
    expect(powertrainPayloadInput(b.payload).organizationId).not.toBe(tampered);
  });

  it.each(DBI_P2C15_SCENARIO_IDS)('%s actual binding vs pinned expectation (powertrain)', (scenarioId) => {
    const pack = buildDbiP2c15ScenarioPackage(scenarioId);
    if (pack.expectation.kind !== 'POWERTRAIN_BINDING') return;
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') return;
    const actual = validateDs4PowertrainDemandResearchInputBinding(
      powertrainPayloadInput(pack.payload),
    );
    assertPinMatchesPowertrainBinding(actual, pack.expectation);
  });

  it('S01 kernel admits via returned input only', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    expect(pack.payload.kind).toBe('POWERTRAIN_INPUT');
    const out = computeDs4PowertrainDemandResearchV1(powertrainPayloadInput(pack.payload));
    expect(out.status).not.toBe('ABSTAINED');
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('S09 B2 missing-channel semantics via returned input', () => {
    const pack = buildDbiP2c15ScenarioPackage('S09_MISSING_REQUIRED_CHANNELS');
    expect(pack.payload.kind).toBe('MODULE_SPECIFIC_SCENARIO');
    expect(pack.payload.kind).toBe('MODULE_SPECIFIC_SCENARIO');
    if (pack.payload.kind === 'MODULE_SPECIFIC_SCENARIO') {
      expect(pack.payload.researchModule).toBe('B2');
    }
    const out = computeDs4PowertrainDemandColdEngineResearchV1(
      powertrainPayloadInput(pack.payload) as never,
    );
    expect(out.status).toBe('NOT_OBSERVED');
    expect(out.coldEngine.deduplicatedCandidateCount).toBe(0);
    const assessable = Object.values(out.coldEngine.subtypeAssessability).filter(
      (s) => s.status === 'ASSESSABLE',
    );
    expect(assessable.length).toBe(0);
  });

  it('S10 insufficient opportunity pinned at bind layer', () => {
    const pack = buildDbiP2c15ScenarioPackage('S10_INSUFFICIENT_OBSERVATIONS');
    expect(pack.payload.kind).toBe('POWERTRAIN_INPUT');
    const actual = validateDs4PowertrainDemandResearchInputBinding(
      powertrainPayloadInput(pack.payload),
    );
    assertPinMatchesPowertrainBinding(actual, pack.expectation as Extract<
      DbiP2c15IndependentExpectationV1,
      { kind: 'POWERTRAIN_BINDING' }
    >);
  });

  it('S11 B3 sole insufficient load via returned input', () => {
    const pack = buildDbiP2c15ScenarioPackage('S11_B3_SOLE_INSUFFICIENT_LOAD');
    expect(pack.payload.kind).toBe('MODULE_SPECIFIC_SCENARIO');
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(powertrainPayloadInput(pack.payload));
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
    expect(isSoleInsufficientLoadLabelBindingFailure(out.abstainReasons)).toBe(true);
    expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(3);
  });

  it('S12 B4 zero assessable facets via returned input', () => {
    const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
    expect(pack.payload.kind).toBe('MODULE_SPECIFIC_SCENARIO');
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      powertrainPayloadInput(pack.payload) as never,
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.revvingIdle.facetA.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(Object.keys(out.revvingIdle.coverageEvidence)).toHaveLength(6);
    expect(out.revvingIdle.facetA.candidates).toHaveLength(0);
  });

  it('S13 powertrain fail-closed matrix', () => {
    const bev = buildDbiP2c15ScenarioPackage('S13_POWERTRAIN_BEV_FAIL_CLOSED');
    expect(bev.payload.kind).toBe('POWERTRAIN_INPUT');
    const bevBind = validateDs4PowertrainDemandResearchInputBinding(powertrainPayloadInput(bev.payload));
    assertPinMatchesPowertrainBinding(bevBind, bev.expectation as Extract<
      DbiP2c15IndependentExpectationV1,
      { kind: 'POWERTRAIN_BINDING' }
    >);

    const unknown = buildDbiP2c15ScenarioPackage('S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED');
    expect(unknown.payload.kind).toBe('MODULE_SPECIFIC_SCENARIO');
    const unknownOut = computeDs4PowertrainDemandSustainedLoadResearchV1(
      powertrainPayloadInput(unknown.payload),
    );
    expect(unknownOut.status).toBe('ABSTAINED');
    expect(unknownOut.abstainReasons).toContain('ICE_OPERATION_NOT_CONFIRMED');

    const contradictory = buildDbiP2c15ScenarioPackage('S13_POWERTRAIN_CONTRADICTORY_FAIL_CLOSED');
    expect(contradictory.payload.kind).toBe('POWERTRAIN_INPUT');
    const contraBind = validateDs4PowertrainDemandResearchInputBinding(
      powertrainPayloadInput(contradictory.payload),
    );
    assertPinMatchesPowertrainBinding(contraBind, contradictory.expectation as Extract<
      DbiP2c15IndependentExpectationV1,
      { kind: 'POWERTRAIN_BINDING' }
    >);
  });

  it('S14 A1 descriptive authority via returned input', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    expect(pack.payload.kind).toBe('A1_INPUT');
    expect(pack.payload.kind).toBe('A1_INPUT');
    const out = computeDs4RpmEpisodeResearchV1(
      pack.payload.kind === 'A1_INPUT' ? pack.payload.input : (null as never),
    );
    expect(out.semanticGuards.notEvidenceCandidate).toBe(true);
    expect(out.semanticGuards.labelsNotForCrossDomainJoin).toBe(true);
    expect(pack.envelope.multichannelFingerprint).toBeNull();
    expect(pack.expectation.kind).toBe('MODULE_KERNEL');
  });

  it('S15 offline negative via returned input', () => {
    const pack = buildDbiP2c15ScenarioPackage('S15_OFFLINE_UNATTESTED_NEGATIVE');
    expect(pack.payload.kind).toBe('POWERTRAIN_INPUT');
    const actual = validateDs4PowertrainDemandResearchInputBinding(
      powertrainPayloadInput(pack.payload),
    );
    assertPinMatchesPowertrainBinding(actual, pack.expectation as Extract<
      DbiP2c15IndependentExpectationV1,
      { kind: 'POWERTRAIN_BINDING' }
    >);
  });

  it('S16 canonical order invariance — buckets, fingerprints, kernel status', () => {
    const pack = buildDbiP2c15ScenarioPackage('S16_CANONICAL_ORDER_INVARIANCE');
    expect(pack.payload.kind).toBe('CANONICAL_ORDER_PAIR');
    if (pack.payload.kind !== 'CANONICAL_ORDER_PAIR') {
      throw new Error('S16 payload required');
    }
    expect(pack.expectation.kind).toBe('CANONICAL_INVARIANCE');

    const forwardCanon = canonicalizeMultichannelObservations(pack.payload.forwardObservations);
    const reversedCanon = canonicalizeMultichannelObservations(pack.payload.reversedObservations);

    expect(forwardCanon.buckets.length).toBe(reversedCanon.buckets.length);
    for (let i = 0; i < forwardCanon.buckets.length; i += 1) {
      expect(forwardCanon.buckets[i]).toEqual(reversedCanon.buckets[i]);
    }

    expect(pack.payload.forwardInput.multichannelFingerprint).toBe(
      pack.payload.reversedInput.multichannelFingerprint,
    );

    const forwardOut = computeDs4PowertrainDemandResearchV1(pack.payload.forwardInput);
    const reversedOut = computeDs4PowertrainDemandResearchV1(pack.payload.reversedInput);
    expect(forwardOut.status).toBe(reversedOut.status);
    expect(forwardOut.kickdown.deduplicatedCandidateCount).toBe(
      reversedOut.kickdown.deduplicatedCandidateCount,
    );
  });
});
