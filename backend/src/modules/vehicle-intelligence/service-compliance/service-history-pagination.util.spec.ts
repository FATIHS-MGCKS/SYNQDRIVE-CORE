import {
  clampServiceHistoryPageLimit,
  decodeServiceHistoryCursor,
  encodeServiceHistoryCursor,
} from './service-history-pagination.util';

describe('service-history-pagination.util', () => {
  it('round-trips cursor encoding', () => {
    const cursor = encodeServiceHistoryCursor({
      eventDateIso: '2024-04-22T00:00:00.000Z',
      id: 'evt_abc',
    });
    expect(decodeServiceHistoryCursor(cursor)).toEqual({
      eventDateIso: '2024-04-22T00:00:00.000Z',
      id: 'evt_abc',
    });
  });

  it('clamps page limit', () => {
    expect(clampServiceHistoryPageLimit(undefined)).toBe(100);
    expect(clampServiceHistoryPageLimit(500)).toBe(100);
    expect(clampServiceHistoryPageLimit(10)).toBe(10);
  });
});
