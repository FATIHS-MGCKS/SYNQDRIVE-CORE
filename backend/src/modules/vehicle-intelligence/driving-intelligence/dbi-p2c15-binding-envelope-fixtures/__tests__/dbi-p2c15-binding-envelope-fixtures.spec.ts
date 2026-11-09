import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import {
  buildBoundResearchInput,
  rpmAtU,
} from '../../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { isSoleInsufficientLoadLabelBindingFailure } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  positiveKickdownGrid,
} from '../../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';
import { buildRpmPointsEverySeconds } from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import {
  buildDbiP2c15ScenarioPackage,
  DBI_P2C15_SCENARIO_IDS,
} from '../dbi-p2c15-binding-envelope.scenarios.v1';
import { DBI_P2C15_TRIP_BASELINE, DBI_P2C15_LINK_BASELINE } from '../dbi-p2c15-binding-envelope.identity.v1';

describe('DBI P2-C1.5 binding envelope fixture library', () => {
  it.each(DBI_P2C15_SCENARIO_IDS)('%s exposes synthetic envelope invariants', (scenarioId) => {
    const pack = buildDbiP2c15ScenarioPackage(scenarioId);
    expect(pack.scenarioId).toBe(scenarioId);
    expect(pack.envelope.contractVersion).toBe('dbi-p2c15-binding-envelope-v1');
    expect(pack.envelope.sourceProvenanceVerified).toBe(false);
    expect(pack.envelope.scenarioId).toBe(scenarioId);
    if (pack.envelope.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
      expect(pack.envelope.sourceBundleId).toBeNull();
    }
    expect(pack.scientificNotes.length).toBeGreaterThan(0);
  });

  it('S01 baseline binding admits powertrain research', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    expect(pack.expectation).toMatchObject({ kind: 'POWERTRAIN_BINDING', bindingOk: true });
    const input = buildBoundPowertrainInput({
      multichannelObservations: positiveKickdownGrid(),
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    });
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.status).not.toBe('ABSTAINED');
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('identity mismatch scenarios fail binding with distinguishable reasons', () => {
    const org = buildDbiP2c15ScenarioPackage('S02_DIFFERENT_ORGANIZATION');
    expect(org.expectation).toMatchObject({ bindingOk: false });
    if (org.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(org.expectation.abstainReasons).toContain('ORGANIZATION_ID_MISMATCH');
    }

    const veh = buildDbiP2c15ScenarioPackage('S03_DIFFERENT_VEHICLE');
    if (veh.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(veh.expectation.abstainReasons).toContain('VEHICLE_ID_MISMATCH');
    }

    const trip = buildDbiP2c15ScenarioPackage('S04_DIFFERENT_TRIP');
    if (trip.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(trip.expectation.abstainReasons).toContain('TRIP_ID_MISMATCH');
    }

    const link = buildDbiP2c15ScenarioPackage('S05_DIFFERENT_SOURCE_LINK');
    if (link.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(link.expectation.abstainReasons).toContain('PROVIDER_SOURCE_LINK_MISMATCH');
    }
  });

  it('fingerprint tamper scenarios fail without auto-repair', () => {
    const v1b = buildDbiP2c15ScenarioPackage('S06_V1B_FINGERPRINT_TAMPER');
    if (v1b.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(v1b.expectation.abstainReasons).toContain('V1B_INPUT_FINGERPRINT_MISMATCH');
    }
    const mc = buildDbiP2c15ScenarioPackage('S07_MULTICHANNEL_FINGERPRINT_TAMPER');
    if (mc.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(mc.expectation.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
    }
  });

  it('S08 conflicting duplicate label fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S08_CONFLICTING_DUPLICATE_LABEL');
    expect(pack.expectation).toMatchObject({ bindingOk: false });
    if (pack.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(pack.expectation.abstainReasons).toContain('CONFLICTING_DUPLICATE_BUCKETS');
    }
  });

  it('S11 B3 sole insufficient load is not global fingerprint tampering', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      rpm: 2000,
      speedKmh: 55,
      throttlePct: 40,
      loadPct: i < 3 ? 80 : null,
    }));
    const input = buildBoundPowertrainInput({
      multichannelObservations: grid,
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    });
    const out = computeDs4PowertrainDemandSustainedLoadResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toEqual(['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS']);
    expect(isSoleInsufficientLoadLabelBindingFailure(out.abstainReasons)).toBe(true);
    expect(out.sustainedLoad.coverageEvidence.loadPresentBucketCount).toBe(3);
  });

  it('S12 B4 zero assessable facets is not a positive detection', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 30, 1, () => ({
      speedKmh: 0,
      rpm: null,
      loadPct: 20,
    }));
    const out = computeDs4PowertrainDemandRevvingIdleResearchV1(
      buildColdEngineBoundInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }) as never,
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.revvingIdle.facetA.assessability).toBe('NOT_ASSESSABLE');
    expect(out.revvingIdle.facetB.assessability).toBe('NOT_ASSESSABLE');
    expect(Object.keys(out.revvingIdle.coverageEvidence)).toHaveLength(6);
  });

  it('S13 BEV fail-closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S13_POWERTRAIN_FAIL_CLOSED');
    expect(pack.expectation).toMatchObject({ bindingOk: false });
    if (pack.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(pack.expectation.abstainReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
    }
  });

  it('S14 A1 remains descriptive-only', () => {
    const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
    expect(pack.expectation.kind).toBe('A1_BINDING');
    const rpmPoints = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1).map((p) => ({
      recordedAtIso: p.recordedAtIso,
      valueRpm: rpmAtU(0.7),
    }));
    const out = computeDs4RpmEpisodeResearchV1(
      buildBoundResearchInput({
        rpmPoints,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }),
    );
    expect(out.semanticGuards.notEvidenceCandidate).toBe(true);
    expect(out.semanticGuards.labelsNotForCrossDomainJoin).toBe(true);
    expect(pack.envelope.multichannelFingerprint).toBeNull();
  });

  it('S15 offline un attested fails closed', () => {
    const pack = buildDbiP2c15ScenarioPackage('S15_OFFLINE_UNATTESTED_NEGATIVE');
    expect(pack.envelope.evidenceOrigin).toBe('OFFLINE_SEALED_BUNDLE');
    expect(pack.expectation).toMatchObject({ bindingOk: false });
    if (pack.expectation.kind === 'POWERTRAIN_BINDING') {
      expect(pack.expectation.abstainReasons).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
      expect(pack.expectation.abstainReasons).toContain('MULTICHANNEL_MANIFEST_MISSING');
    }
  });

  it('S16 canonical order invariance', () => {
    const pack = buildDbiP2c15ScenarioPackage('S16_CANONICAL_ORDER_INVARIANCE');
    expect(pack.expectation).toEqual({
      kind: 'CANONICAL_INVARIANCE',
      fingerprintsMatchForwardAndReversed: true,
    });
  });
});
