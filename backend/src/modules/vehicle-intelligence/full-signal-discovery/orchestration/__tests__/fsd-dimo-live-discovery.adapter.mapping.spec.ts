import {
  mapHistoricalRowToObservations,
  mapSignalsLatestFieldToSnapshotValue,
} from '../fsd-dimo-live-discovery.adapter.v1';

describe('FSD live adapter field mapping (snapshot + historical)', () => {
  describe('mapSignalsLatestFieldToSnapshotValue', () => {
    it('treats absent signalsLatest key as MISSING', () => {
      expect(mapSignalsLatestFieldToSnapshotValue('speed', undefined, false)).toEqual({ kind: 'MISSING' });
    });

    it('treats present key with null raw as explicit NULL (FLOAT)', () => {
      expect(mapSignalsLatestFieldToSnapshotValue('speed', null, true)).toEqual({
        kind: 'NULL',
        numericValue: null,
      });
    });

    it('maps FLOAT zero to VALID_ZERO', () => {
      expect(mapSignalsLatestFieldToSnapshotValue('speed', { value: 0 }, true)).toEqual({
        kind: 'VALID_ZERO',
        numericValue: 0,
      });
    });

    it('maps FLOAT nonzero to VALID_NONZERO', () => {
      expect(mapSignalsLatestFieldToSnapshotValue('speed', { value: 42.5 }, true)).toEqual({
        kind: 'VALID_NONZERO',
        numericValue: 42.5,
      });
    });
  });

  describe('mapHistoricalRowToObservations', () => {
    const ts = 1_700_000_000_000;

    it('FLOAT: missing column omits numericValue (MISSING semantics)', () => {
      const obs = mapHistoricalRowToObservations('speed', { timestamp: ts }, 'timestamp');
      expect(obs).toEqual([{ timestampMs: ts }]);
      expect(obs[0]).not.toHaveProperty('numericValue');
    });

    it('FLOAT: null cell is OBSERVED_NULL', () => {
      const obs = mapHistoricalRowToObservations(
        'speed',
        { timestamp: ts, speed: null },
        'timestamp',
      );
      expect(obs).toEqual([{ timestampMs: ts, numericValue: null }]);
    });

    it('FLOAT: numeric zero is OBSERVED_ZERO', () => {
      const obs = mapHistoricalRowToObservations(
        'speed',
        { timestamp: ts, speed: 0 },
        'timestamp',
      );
      expect(obs).toEqual([{ timestampMs: ts, numericValue: 0 }]);
    });
  });
});
