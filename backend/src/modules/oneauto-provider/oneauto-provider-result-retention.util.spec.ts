import {
  computeOneAutoProviderResultExpiresAt,
  ONEAUTO_DEFAULT_PROVIDER_RESULT_RETENTION_MS,
} from './oneauto-provider-result-retention.util';

describe('OneAuto provider result retention util', () => {
  it('computes expiresAt as dispatch + 24h default', () => {
    const dispatch = new Date('2026-11-03T10:00:00.000Z');
    const expires = computeOneAutoProviderResultExpiresAt(dispatch);
    expect(expires.toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it('falls back to default retention when retentionMs invalid', () => {
    const dispatch = new Date('2026-11-03T10:00:00.000Z');
    const expires = computeOneAutoProviderResultExpiresAt(dispatch, 0);
    expect(expires.getTime() - dispatch.getTime()).toBe(ONEAUTO_DEFAULT_PROVIDER_RESULT_RETENTION_MS);
  });
});
