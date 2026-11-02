import {
  buildVsiRpmCombinedEvidenceInputFromProfileSignal,
  resolveVsiRpmCombinedEvidenceAvailabilityV1,
  VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN,
} from './vsi-engine-rpm-combined-evidence-v1.util';

describe('vsi-engine-rpm-combined-evidence-v1.util', () => {
  const audiCadence = {
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    observedSampleCount: 2076,
    finalizedTripCount: 20,
    activeRpmProfile: {
      activeProfile: 'RPM_STANDARD',
      tripClassifications: [{ tripId: 't1' }],
    },
    limitations: [],
  };

  it('1. snapshot live + HF historical → PROVEN_LIVE (HF does not upgrade alone)', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'OBSERVED',
        freshnessClassification: 'FRESH',
        lastValidObservationAt: '2026-10-15T10:00:00.000Z',
        qualityClassification: 'OBSERVED_FRESH',
      },
      cadence: {
        observedSampleCount: 100,
        finalizedTripCount: 5,
        activeRpmProfile: 'RPM_STANDARD',
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        limitations: [],
        tripClassificationCount: 1,
      },
    });
    expect(result.availability).toBe('PROVEN_LIVE');
  });

  it('2. snapshot live, HF missing → PROVEN_LIVE', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'OBSERVED',
        freshnessClassification: 'FRESH',
        lastValidObservationAt: '2026-10-15T10:00:00.000Z',
        qualityClassification: 'OBSERVED_FRESH',
      },
      cadence: {
        observedSampleCount: null,
        finalizedTripCount: null,
        activeRpmProfile: null,
        provenance: [],
        limitations: [],
        tripClassificationCount: 0,
      },
    });
    expect(result.availability).toBe('PROVEN_LIVE');
  });

  it('3. Audi reference: snapshot NEVER_OBSERVED + HF historical → PROVEN_HISTORICAL_ONLY', () => {
    const input = buildVsiRpmCombinedEvidenceInputFromProfileSignal({
      rpmApplicability: 'APPLICABLE',
      profileLimitations: [],
      signal: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
        powertrainApplicability: 'APPLICABLE',
        cadenceIntelligence: audiCadence,
      } as never,
    });
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1(input);
    expect(result.availability).toBe('PROVEN_HISTORICAL_ONLY');
    expect(input.cadence.activeRpmProfile).toBe('RPM_STANDARD');
  });

  it('4. both lanes absent → NOT_PROVEN', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
      },
      cadence: {
        observedSampleCount: null,
        finalizedTripCount: null,
        activeRpmProfile: null,
        provenance: [],
        limitations: [],
        tripClassificationCount: 0,
      },
    });
    expect(result.availability).toBe('NOT_PROVEN');
  });

  it('5. stale snapshot + HF historical → PROVEN_HISTORICAL_ONLY (not PROVEN_LIVE)', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'OBSERVED',
        freshnessClassification: 'STALE',
        lastValidObservationAt: '2026-09-01T10:00:00.000Z',
        qualityClassification: 'OBSERVED_STALE',
      },
      cadence: {
        observedSampleCount: 500,
        finalizedTripCount: 10,
        activeRpmProfile: 'RPM_STANDARD',
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        limitations: [],
        tripClassificationCount: 2,
      },
    });
    expect(result.availability).toBe('PROVEN_HISTORICAL_ONLY');
  });

  it('6. HF samples but attribution unproven (multi-link) → NOT_PROVEN + limitation', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: ['MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS'],
      snapshot: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
      },
      cadence: {
        observedSampleCount: 2000,
        finalizedTripCount: 20,
        activeRpmProfile: 'RPM_STANDARD',
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        limitations: [],
        tripClassificationCount: 1,
      },
    });
    expect(result.availability).toBe('NOT_PROVEN');
    expect(result.limitations).toContain(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  });

  it('7. source link attribution failure on cadence lane → NOT_PROVEN', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
      },
      cadence: {
        observedSampleCount: 100,
        finalizedTripCount: 5,
        activeRpmProfile: 'RPM_STANDARD',
        provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
        limitations: [VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN],
        tripClassificationCount: 1,
      },
    });
    expect(result.availability).toBe('NOT_PROVEN');
  });

  it('8. EV engine_rpm NOT_APPLICABLE → NOT_APPLICABLE', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'NOT_APPLICABLE',
      powertrainApplicability: 'NOT_APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'NOT_APPLICABLE',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NOT_APPLICABLE',
      },
      cadence: {
        observedSampleCount: null,
        finalizedTripCount: null,
        activeRpmProfile: null,
        provenance: [],
        limitations: [],
        tripClassificationCount: 0,
      },
    });
    expect(result.availability).toBe('NOT_APPLICABLE');
  });

  it('9. ICE applicable never observed, no HF → NOT_PROVEN', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'APPLICABLE',
      powertrainApplicability: 'APPLICABLE',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
      },
      cadence: {
        observedSampleCount: null,
        finalizedTripCount: null,
        activeRpmProfile: 'UNKNOWN',
        provenance: [],
        limitations: [],
        tripClassificationCount: 0,
      },
    });
    expect(result.availability).toBe('NOT_PROVEN');
  });

  it('10. unknown powertrain does not invent NOT_APPLICABLE; no lanes → NOT_PROVEN', () => {
    const result = resolveVsiRpmCombinedEvidenceAvailabilityV1({
      rpmApplicability: 'UNKNOWN',
      powertrainApplicability: 'UNKNOWN',
      profileLimitations: [],
      snapshot: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
      },
      cadence: {
        observedSampleCount: null,
        finalizedTripCount: null,
        activeRpmProfile: null,
        provenance: [],
        limitations: [],
        tripClassificationCount: 0,
      },
    });
    expect(result.availability).toBe('NOT_PROVEN');
  });
});
