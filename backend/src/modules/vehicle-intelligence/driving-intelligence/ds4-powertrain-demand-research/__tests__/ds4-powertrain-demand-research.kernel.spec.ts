import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
  positiveKickdownGrid,
  R1_DIMO,
} from './ds4-powertrain-demand-research.test-helpers';

describe('ds4-powertrain-demand-research kernel', () => {
  it('positive synthetic bucket pattern produces KICKDOWN_LIKE_PROXY_CANDIDATE', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(out.status).toBe('COMPUTED');
    expect(out.kickdown.deduplicatedCandidateCount).toBeGreaterThan(0);
    expect(out.kickdown.candidates[0]?.classification).toBe('KICKDOWN_LIKE_PROXY_CANDIDATE');
    expect(out.timeAuthority).toBe('BUCKET_LABEL_UNVERIFIED');
    expect(out.temporalMode).toBe('MODE_A');
    expect(JSON.stringify(out)).not.toMatch(/durationMs|syncDeltaMs|confidenceFactor|throttleRisePctPerSec/);
  });

  it('constant throttle with RPM rise yields no proxy candidate', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      throttlePct: 40,
      rpm: 2000 + i * 200,
      speedKmh: 55 + i,
      loadPct: 70,
    }));
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.kickdown.deduplicatedCandidateCount).toBe(0);
  });

  it('throttle spike without RPM support yields no proxy', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
      if (i === 0) return { throttlePct: 20, rpm: 2000, speedKmh: 55, loadPct: 70 };
      if (i === 1) return { throttlePct: 50, rpm: 2050, speedKmh: 58, loadPct: 72 };
      if (i === 2) return { throttlePct: 93, rpm: 2100, speedKmh: 62, loadPct: 75 };
      return { throttlePct: 40, rpm: 2100, speedKmh: 63, loadPct: 50 };
    });
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.kickdown.candidates.every((c) => c.classification !== 'KICKDOWN_LIKE_PROXY_CANDIDATE')).toBe(true);
  });

  it('missing engine load on R1 abstains or yields no proxy', () => {
    const grid = positiveKickdownGrid().map((r) => ({ ...r, loadPct: null }));
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(
      out.status === 'ABSTAINED'
        ? out.abstainReasons.includes('CHANNEL_COVERAGE_BELOW_MINIMUM')
        : out.kickdown.deduplicatedCandidateCount === 0,
    ).toBe(true);
  });

  it('EV powertrain abstains', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: positiveKickdownGrid(),
        isEvPowertrain: true,
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
  });

  it('caller iceOperationConfirmed alone abstains', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: positiveKickdownGrid(),
        fuelType: 'PHEV',
        declaredIceOperationConfirmed: true,
      }),
    );
    expect(out.abstainReasons).toContain('ICE_CONFIRMATION_CALLER_ONLY');
  });

  it('R1 tags historical uncertainty and caps support tier', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: positiveKickdownGrid(),
        dimoVehicleRawJson: R1_DIMO,
      }),
    );
    if (out.kickdown.candidates[0]) {
      expect(out.r1HistoricalObdRecordTimeUncertain).toBe(true);
      expect(out.kickdown.candidates[0].candidateSupportTier).not.toBe('STRONG');
    }
  });

  it('offline bundle without manifest abstains', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: positiveKickdownGrid(),
        evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
        multichannelManifest: null,
      }),
    );
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('MULTICHANNEL_MANIFEST_MISSING');
    expect(out.abstainReasons).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('forbidden R1 channel populated abstains', () => {
    const grid = positiveKickdownGrid().map((r, i) =>
      i === 0 ? { ...r, gear: 3 } : r,
    );
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.abstainReasons).toContain('R1_FORBIDDEN_CHANNEL_POPULATED');
  });

  it('conflicting duplicate epoch abstains', () => {
    const t = Date.parse('2026-01-01T10:00:02.000Z');
    const grid = positiveKickdownGrid();
    grid.push({
      recordedAtIso: new Date(t).toISOString(),
      throttlePct: 90,
      rpm: 9999,
      speedKmh: 70,
      loadPct: 80,
    });
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.abstainReasons).toContain('CONFLICTING_DUPLICATE_BUCKETS');
  });

  it('PHEV without bound ICE signals in candidate window yields no proxy', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, () => ({
      throttlePct: 30,
      rpm: 100,
      speedKmh: 40,
      loadPct: 5,
    }));
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({
        multichannelObservations: grid,
        fuelType: 'PHEV',
      }),
    );
    expect(out.kickdown.deduplicatedCandidateCount).toBe(0);
    expect(out.provenance.independentFieldValidation).toBe(false);
  });

  it('synthetic success never claims source attestation', () => {
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
    expect(out.provenance.independentFieldValidation).toBe(false);
    expect(out.kickdown.coverageEvidence.rpmTripCoverage).not.toBeNull();
    expect(out.kickdown.coverageEvidence.multichannelObservedGridCoverage).not.toBeNull();
  });

  it('shuffled input ordering is deterministic', () => {
    const shuffled = [...positiveKickdownGrid()].reverse();
    const a = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() }),
    );
    const b = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: shuffled }),
    );
    expect(a.kickdown.deduplicatedCandidateCount).toBe(b.kickdown.deduplicatedCandidateCount);
  });

  it('gradual overtaking yields no proxy', () => {
    const grid = buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => ({
      throttlePct: 30 + i * 3,
      rpm: 2000 + i * 80,
      speedKmh: 50 + i * 2,
      loadPct: 40 + i * 2,
    }));
    const out = computeDs4PowertrainDemandResearchV1(
      buildBoundPowertrainInput({ multichannelObservations: grid }),
    );
    expect(out.kickdown.deduplicatedCandidateCount).toBe(0);
  });
});
