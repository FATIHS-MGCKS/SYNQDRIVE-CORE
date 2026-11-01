import { parseRecoveryScanCursor } from '../trip-di-boundary-admission-recovery.cursor';

describe('parseRecoveryScanCursor', () => {
  it('rejects invalid endTimeUtc timestamps', () => {
    expect(parseRecoveryScanCursor({ endTimeUtc: 'not-a-date', tripId: 't1' })).toBeNull();
  });

  it('normalizes valid timestamps', () => {
    expect(parseRecoveryScanCursor({ endTimeUtc: '2026-10-01T10:00:00.000Z', tripId: 't1' })).toEqual({
      endTimeUtc: '2026-10-01T10:00:00.000Z',
      tripId: 't1',
    });
  });
});
