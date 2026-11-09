import {
  collectTemporalViolations,
  isCanonicalProviderBucketLabelIso,
} from '../dbi-p2c2-evidence-adapter.temporal.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../dbi-p2c2-b1-evidence-adapter.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { buildDbiP2c15ScenarioPackage } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';

describe('dbi-p2c2 canonical ISO temporal validation', () => {
  it('accepts valid canonical ISO including leap day', () => {
    expect(isCanonicalProviderBucketLabelIso('2024-02-29T12:00:00.000Z')).toBe(true);
    expect(isCanonicalProviderBucketLabelIso('2026-01-01T10:00:01.000Z')).toBe(true);
  });

  it('rejects normalized invalid calendar day (Feb 30)', () => {
    expect(isCanonicalProviderBucketLabelIso('2026-02-30T12:00:00.000Z')).toBe(false);
  });

  it('rejects non-canonical format without milliseconds', () => {
    expect(isCanonicalProviderBucketLabelIso('2026-01-01T10:00:01Z')).toBe(false);
  });

  it('rejects end before start', () => {
    const codes = collectTemporalViolations([
      {
        startIso: '2026-01-01T10:00:05.000Z',
        endIso: '2026-01-01T10:00:01.000Z',
      },
    ]);
    expect(codes).toContain('INVALID_TEMPORAL_INTERVAL_ORDER');
  });

  it('rejects reversed bucket indices', () => {
    const codes = collectTemporalViolations([
      {
        startIso: '2026-01-01T10:00:01.000Z',
        endIso: '2026-01-01T10:00:05.000Z',
        startBucketIndex: 5,
        endBucketIndex: 2,
      },
    ]);
    expect(codes).toContain('INVALID_BUCKET_INDEX_ORDER');
  });

  it('adapter fails closed on Feb-30 candidate label', () => {
    const pack = buildDbiP2c15ScenarioPackage('S01_VALID_ICE_BASELINE');
    if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain');
    const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
    const tampered = structuredClone(kernel);
    const base = tampered.kickdown.candidates[0];
    if (!base) throw new Error('need candidate');
    tampered.kickdown.candidates = [
      {
        ...base,
        providerBucketLabelStartIso: '2026-02-30T12:00:00.000Z',
      },
    ];
    const out = adaptDs4KickdownResearchToP2c2Evidence(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnosticCodes).toContain('INVALID_PROVIDER_BUCKET_LABEL');
  });
});
