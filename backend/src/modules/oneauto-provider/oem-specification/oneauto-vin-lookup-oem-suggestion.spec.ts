import { REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import { compareOemVinLookupEuSuggestions } from './oneauto-vin-lookup-oem-suggestion.comparison';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_AUDI_A4_SANITIZED_RESULT } from './oneauto-vin-lookup-oem-suggestion.fixtures';
import { normalizeOemVinLookupEuSuggestions } from './oneauto-vin-lookup-oem-suggestion.normalizer';
import {
  ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS,
  ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS,
} from './oneauto-vin-lookup-oem-suggestion.types';

const FETCHED_AT = '2026-11-03T04:00:00.000Z';
const SNAPSHOT_AT = '2026-11-03T04:00:01.000Z';

function normalizeAudi() {
  const result = normalizeOemVinLookupEuSuggestions({
    providerResult: ONEAUTO_OEM_VIN_LOOKUP_EU_AUDI_A4_SANITIZED_RESULT,
    fetchedAt: FETCHED_AT,
    snapshotCreatedAt: SNAPSHOT_AT,
  });
  if (!result.ok) throw new Error(result.code);
  return result.snapshot;
}

describe('oneauto-vin-lookup-oem-suggestion.normalizer', () => {
  it('maps six documented provider properties to canonical OEM desc fields', () => {
    const snapshot = normalizeAudi();
    expect(snapshot.mappedSuggestions.oemModelRangeDesc).toEqual({
      canonicalFieldKey: 'oemModelRangeDesc',
      value: 'A4 (B9)',
      providerFieldPath: 'oem_model_range_desc',
    });
    expect(snapshot.mappedSuggestions.oemDerivativeDesc?.value).toBe('2.0 TDI');
    expect(snapshot.mappedSuggestions.oemEngineDesc?.value).toBe('DDAA');
    expect(snapshot.mappedSuggestions.oemTransmissionDesc?.value).toBe('automatic');
    expect(snapshot.mappedSuggestions.exteriorColorDesc?.value).toBe('Daytona grey');
    expect(snapshot.mappedSuggestions.interiorTrimDesc?.value).toBe('Leather');
    expect(Object.keys(snapshot.mappedSuggestions)).toHaveLength(6);
  });

  it('lists four OEM code fields as explicitly unmapped', () => {
    const snapshot = normalizeAudi();
    expect(snapshot.unmappedCodeFieldKeys).toContain('oemEngineCode');
    expect('oemEngineCode' in snapshot.mappedSuggestions).toBe(false);
  });

  it('records provider field paths for mapped keys', () => {
    for (const [canonical, providerPath] of Object.entries(ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS)) {
      expect(normalizeAudi().mappedSuggestions[canonical as keyof typeof ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS]
        ?.providerFieldPath).toBe(providerPath);
    }
  });

  it('skips empty and malformed provider values without failing the snapshot', () => {
    const result = normalizeOemVinLookupEuSuggestions({
      providerResult: {
        oem_model_range_desc: '   ',
        oem_derivative_desc: 42,
        oem_engine_desc: null,
        oem_transmission_type_desc: 'auto',
        oem_colour_desc: 'Grey',
        oem_interior_trim_desc: 'Fabric',
        date_last_updated: 'not-a-date',
      },
      fetchedAt: FETCHED_AT,
      snapshotCreatedAt: SNAPSHOT_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.mappedSuggestions.oemModelRangeDesc).toBeUndefined();
    expect(result.snapshot.skippedProviderFields.oemModelRangeDesc).toBe('PROVIDER_FIELD_EMPTY');
    expect(result.snapshot.skippedProviderFields.oemDerivativeDesc).toBe('PROVIDER_FIELD_NOT_STRING');
    expect(result.snapshot.skippedProviderFields.oemEngineDesc).toBe('PROVIDER_FIELD_ABSENT');
    expect(result.snapshot.mappedSuggestions.oemTransmissionDesc?.value).toBe('auto');
    expect(result.snapshot.timestamps.providerDataUpdatedAt).toBeNull();
  });

  it('rejects over-length strings for mapped fields', () => {
    const long = 'x'.repeat(513);
    const result = normalizeOemVinLookupEuSuggestions({
      providerResult: { oem_model_range_desc: long },
      fetchedAt: FETCHED_AT,
      snapshotCreatedAt: SNAPSHOT_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.skippedProviderFields.oemModelRangeDesc).toBe('PROVIDER_FIELD_TOO_LONG');
  });

  it('fail-closes non-object provider results', () => {
    expect(
      normalizeOemVinLookupEuSuggestions({
        providerResult: null,
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      }),
    ).toEqual({ ok: false, code: 'INVALID_PROVIDER_RESULT' });
  });

  it('fail-closes invalid timestamp inputs', () => {
    expect(
      normalizeOemVinLookupEuSuggestions({
        providerResult: {},
        fetchedAt: 'not-iso',
        snapshotCreatedAt: SNAPSHOT_AT,
      }),
    ).toEqual({ ok: false, code: 'INVALID_FETCHED_AT' });
  });

  it('preserves distinct providerDataUpdatedAt, fetchedAt and snapshotCreatedAt', () => {
    const snapshot = normalizeAudi();
    expect(snapshot.timestamps.providerDataUpdatedAt).toBe('2025-09-23');
    expect(snapshot.timestamps.fetchedAt).toBe(FETCHED_AT);
    expect(snapshot.timestamps.snapshotCreatedAt).toBe(SNAPSHOT_AT);
  });

  it('does not mutate the input provider result object', () => {
    const input = { ...ONEAUTO_OEM_VIN_LOOKUP_EU_AUDI_A4_SANITIZED_RESULT, oem_engine_desc: '  DDAA  ' };
    const before = JSON.stringify(input);
    normalizeOemVinLookupEuSuggestions({
      providerResult: input,
      fetchedAt: FETCHED_AT,
      snapshotCreatedAt: SNAPSHOT_AT,
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(input.oem_engine_desc).toBe('  DDAA  ');
  });
});

describe('oneauto-vin-lookup-oem-suggestion.comparison', () => {
  it('returns NOT_COMPARABLE for four unmapped code fields', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {});
    for (const key of ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS) {
      const row = comparison.fields.find((f) => f.canonicalFieldKey === key);
      expect(row?.comparisonState).toBe('NOT_COMPARABLE');
      expect(row?.suggestedValue).toBeNull();
      expect(row?.providerFieldPath).toBeNull();
    }
  });

  it('classifies MISSING when canonical is empty and suggestion exists', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {});
    expect(comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc')?.comparisonState).toBe(
      'MISSING',
    );
  });

  it('classifies MATCH when canonical equals normalized suggestion', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {
      oemEngineDesc: { value: 'DDAA' },
      exteriorColorDesc: { value: 'Daytona grey' },
    });
    expect(comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc')?.comparisonState).toBe(
      'MATCH',
    );
  });

  it('classifies CONFLICT when canonical differs from suggestion', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {
      oemEngineDesc: { value: 'OTHER' },
    });
    const row = comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc');
    expect(row?.comparisonState).toBe('CONFLICT');
    expect(row?.suggestedValue).toBe('DDAA');
    expect(row?.canonicalValue).toBe('OTHER');
  });

  it('keeps USER_CONFIRMED CONFLICT visible (not NOT_COMPARABLE)', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {
      oemEngineDesc: { value: 'CONFIRMED_OTHER', confirmationStatus: 'USER_CONFIRMED' },
    });
    const row = comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc');
    expect(row?.comparisonState).toBe('CONFLICT');
    expect(row?.confirmationStatus).toBe('USER_CONFIRMED');
  });

  it('keeps protection status orthogonal to comparison state', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {
      oemEngineDesc: { value: 'DDAA', confirmationStatus: 'PROTECTED' },
    });
    const row = comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc');
    expect(row?.comparisonState).toBe('MATCH');
    expect(row?.confirmationStatus).toBe('PROTECTED');
  });

  it('never allows implicit confirmation', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {});
    for (const row of comparison.fields) {
      expect(row.implicitConfirmationAllowed).toBe(false);
    }
  });

  it('covers all ten registry fields in stable order', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {});
    expect(comparison.fields.map((f) => f.canonicalFieldKey)).toEqual([
      ...REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS,
    ]);
  });

  it('normalizes canonical whitespace before comparison', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {
      oemEngineDesc: { value: '  DDAA  ' },
    });
    expect(comparison.fields.find((f) => f.canonicalFieldKey === 'oemEngineDesc')?.comparisonState).toBe(
      'MATCH',
    );
  });

  it('Audi A4 offline fixture yields six MISSING desc imports and four NOT_COMPARABLE codes', () => {
    const comparison = compareOemVinLookupEuSuggestions(normalizeAudi(), {});
    const mapped = comparison.fields.filter((f) =>
      Object.keys(ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS).includes(f.canonicalFieldKey),
    );
    expect(mapped.every((f) => f.comparisonState === 'MISSING')).toBe(true);
    expect(
      comparison.fields.filter((f) => f.comparisonState === 'NOT_COMPARABLE'),
    ).toHaveLength(4);
  });

  describe('absent provider suggestion (NOT_COMPARABLE regression)', () => {
    function emptySnapshot() {
      const result = normalizeOemVinLookupEuSuggestions({
        providerResult: {},
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      });
      if (!result.ok) throw new Error(result.code);
      return result.snapshot;
    }

    function rowFor(
      comparison: ReturnType<typeof compareOemVinLookupEuSuggestions>,
      key: keyof typeof ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS,
    ) {
      return comparison.fields.find((f) => f.canonicalFieldKey === key);
    }

    it('classifies mapped fields as NOT_COMPARABLE when provider property absent', () => {
      const comparison = compareOemVinLookupEuSuggestions(emptySnapshot(), {});
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
      expect(rowFor(comparison, 'oemEngineDesc')?.suggestedValue).toBeNull();
    });

    it('classifies NOT_COMPARABLE for null provider property', () => {
      const snap = normalizeOemVinLookupEuSuggestions({
        providerResult: { oem_engine_desc: null },
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      });
      if (!snap.ok) throw new Error(snap.code);
      const comparison = compareOemVinLookupEuSuggestions(snap.snapshot, {});
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
    });

    it('classifies NOT_COMPARABLE for empty provider string', () => {
      const snap = normalizeOemVinLookupEuSuggestions({
        providerResult: { oem_engine_desc: '  ' },
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      });
      if (!snap.ok) throw new Error(snap.code);
      const comparison = compareOemVinLookupEuSuggestions(snap.snapshot, {});
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
    });

    it('classifies NOT_COMPARABLE for invalid provider type', () => {
      const snap = normalizeOemVinLookupEuSuggestions({
        providerResult: { oem_engine_desc: 12345 },
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      });
      if (!snap.ok) throw new Error(snap.code);
      const comparison = compareOemVinLookupEuSuggestions(snap.snapshot, {});
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
    });

    it('classifies NOT_COMPARABLE for overlong provider value', () => {
      const snap = normalizeOemVinLookupEuSuggestions({
        providerResult: { oem_engine_desc: 'x'.repeat(513) },
        fetchedAt: FETCHED_AT,
        snapshotCreatedAt: SNAPSHOT_AT,
      });
      if (!snap.ok) throw new Error(snap.code);
      const comparison = compareOemVinLookupEuSuggestions(snap.snapshot, {});
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
    });

    it('classifies NOT_COMPARABLE when canonical present but provider suggestion absent', () => {
      const comparison = compareOemVinLookupEuSuggestions(emptySnapshot(), {
        oemEngineDesc: { value: 'CONFIRMED' },
      });
      const row = rowFor(comparison, 'oemEngineDesc');
      expect(row?.comparisonState).toBe('NOT_COMPARABLE');
      expect(row?.canonicalValue).toBe('CONFIRMED');
      expect(row?.suggestedValue).toBeNull();
    });

    it('classifies NOT_COMPARABLE when both canonical and provider suggestion absent', () => {
      const comparison = compareOemVinLookupEuSuggestions(emptySnapshot(), {
        oemEngineDesc: { value: null },
      });
      expect(rowFor(comparison, 'oemEngineDesc')?.comparisonState).toBe('NOT_COMPARABLE');
    });

    it('never allows implicit confirmation when suggestion is NOT_COMPARABLE', () => {
      const comparison = compareOemVinLookupEuSuggestions(emptySnapshot(), {});
      for (const row of comparison.fields) {
        expect(row.implicitConfirmationAllowed).toBe(false);
      }
    });
  });
});
