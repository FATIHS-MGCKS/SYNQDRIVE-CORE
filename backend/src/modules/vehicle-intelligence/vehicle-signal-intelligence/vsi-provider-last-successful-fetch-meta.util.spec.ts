import { resolveProviderLastSuccessfulFetchFreshness } from './vsi-provider-last-successful-fetch-meta.util';

describe('vsi-provider-last-successful-fetch-meta.util', () => {
  const projectionMs = Date.parse('2026-10-30T12:00:00.000Z');

  it('returns UNKNOWN when fetch timestamp missing', () => {
    expect(
      resolveProviderLastSuccessfulFetchFreshness({
        providerFetchedAt: null,
        projectionAsOfMs: projectionMs,
      }).freshnessClassification,
    ).toBe('UNKNOWN');
  });

  it('classifies recent fetch as FRESH (live bucket)', () => {
    const result = resolveProviderLastSuccessfulFetchFreshness({
      providerFetchedAt: new Date(projectionMs - 30_000),
      projectionAsOfMs: projectionMs,
    });
    expect(result.freshnessClassification).toBe('FRESH');
  });

  it('classifies aged fetch as STALE (offline bucket)', () => {
    const result = resolveProviderLastSuccessfulFetchFreshness({
      providerFetchedAt: new Date(projectionMs - 7 * 24 * 3600 * 1000),
      projectionAsOfMs: projectionMs,
    });
    expect(result.freshnessClassification).toBe('STALE');
  });

  it('rejects future fetch timestamps', () => {
    const result = resolveProviderLastSuccessfulFetchFreshness({
      providerFetchedAt: new Date(projectionMs + 120_000),
      projectionAsOfMs: projectionMs,
    });
    expect(result.freshnessClassification).toBe('UNKNOWN');
    expect(result.limitations).toContain('FUTURE_PROVIDER_FETCH_TIMESTAMP_REJECTED');
  });
});
