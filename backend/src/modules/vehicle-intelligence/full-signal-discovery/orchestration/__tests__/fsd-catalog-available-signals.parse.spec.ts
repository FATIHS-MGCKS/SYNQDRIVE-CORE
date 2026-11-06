import { parseFsdCatalogAvailableSignalsFromDataV1 } from '../fsd-dimo-live-discovery.adapter.v1';

describe('parseFsdCatalogAvailableSignalsFromDataV1', () => {
  it('accepts explicit empty array', () => {
    expect(parseFsdCatalogAvailableSignalsFromDataV1({ availableSignals: [] })).toEqual({
      ok: true,
      availableSignals: [],
    });
  });

  it('rejects missing key', () => {
    expect(parseFsdCatalogAvailableSignalsFromDataV1({})).toMatchObject({
      ok: false,
      reason: 'available_signals_key_missing',
    });
  });

  it('rejects null list', () => {
    expect(parseFsdCatalogAvailableSignalsFromDataV1({ availableSignals: null })).toMatchObject({
      ok: false,
      reason: 'available_signals_null',
    });
  });

  it('rejects non-array', () => {
    expect(parseFsdCatalogAvailableSignalsFromDataV1({ availableSignals: 'x' })).toMatchObject({
      ok: false,
      reason: 'available_signals_not_array',
    });
  });

  it('rejects non-string element', () => {
    expect(parseFsdCatalogAvailableSignalsFromDataV1({ availableSignals: ['a', 1] })).toMatchObject({
      ok: false,
      reason: 'available_signals_element_not_string:1',
    });
  });
});
