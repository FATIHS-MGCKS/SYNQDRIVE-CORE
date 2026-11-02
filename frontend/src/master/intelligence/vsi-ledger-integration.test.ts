import { describe, expect, it } from 'vitest';
import {
  buildMasterIntelligenceSearch,
  emptyIntelligenceContext,
  mergeMasterIntelligenceContext,
  parseMasterIntelligenceContext,
  pushMasterIntelligenceUrl,
} from './master-intelligence-url';
import { EMPTY_VSI_LEDGER_FILTERS } from './vsi-ledger-url.types';
import { ledgerContextForVehicleChange, pruneLedgerFiltersForSignals } from './vsi-ledger-url.util';
import { filterSignalsForLedger, hasAttributableHfEvidence } from './vsi-ledger-filter.util';
import {
  ATTRIBUTION_LIMITED_RPM,
  AUDI_ENGINE_RPM_SIGNAL,
  BEV_NOT_APPLICABLE_SIGNAL,
} from './ledger/ledger-test-fixtures';

const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const vehicle = '19fedd4b-c4e8-4de8-a125-dab293326e7e';

describe('vsi ledger URL parsing', () => {
  it('parses tab, filters, and signalKey', () => {
    const ctx = parseMasterIntelligenceContext(
      `?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}&tab=ledger&signalKey=engine_rpm&q=rpm&appl=APPLICABLE&obs=NEVER_OBSERVED&fresh=UNKNOWN&rpm=PROVEN_HISTORICAL_ONLY&lim=1&hf=1&hideNA=1`,
    );
    expect(ctx.vsiTab).toBe('ledger');
    expect(ctx.signalKey).toBe('engine_rpm');
    expect(ctx.ledgerFilters.q).toBe('rpm');
    expect(ctx.ledgerFilters.appl).toEqual(['APPLICABLE']);
    expect(ctx.ledgerFilters.lim).toBe(true);
    expect(ctx.ledgerFilters.hideNA).toBe(true);
  });

  it('rejects invalid ledger params without crashing', () => {
    const ctx = parseMasterIntelligenceContext(
      '?view=vsi-intelligence&tab=invalid&signalKey=Bad-Key&appl=NOPE&lim=2',
    );
    expect(ctx.vsiTab).toBe('overview');
    expect(ctx.signalKey).toBeNull();
    expect(ctx.ledgerFilters.appl).toEqual([]);
    expect(ctx.rejectedParams).toEqual(expect.arrayContaining(['tab', 'signalKey', 'appl', 'lim']));
  });

  it('defaults to ledger tab when signalKey is valid without tab', () => {
    const ctx = parseMasterIntelligenceContext('?view=vsi-intelligence&signalKey=engine_rpm');
    expect(ctx.vsiTab).toBe('ledger');
    expect(ctx.signalKey).toBe('engine_rpm');
  });

  it('omits ledger params from APDS search build', () => {
    const ctx = mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
      orgId: org,
      vsiTab: 'ledger',
      signalKey: 'engine_rpm',
      ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'x' },
    });
    const apds = buildMasterIntelligenceSearch('apds-intelligence', ctx);
    expect(apds).not.toContain('tab=');
    expect(apds).not.toContain('signalKey=');
    const vsi = buildMasterIntelligenceSearch('vsi-intelligence', ctx);
    expect(vsi).toContain('tab=ledger');
    expect(vsi).toContain('signalKey=engine_rpm');
    expect(vsi).toContain('q=x');
  });

  it('clears ledger state on vehicle change helper', () => {
    const patch = ledgerContextForVehicleChange({ vehicleId: vehicle });
    expect(patch.vsiTab).toBe('overview');
    expect(patch.signalKey).toBeNull();
    expect(patch.ledgerFilters).toEqual(EMPTY_VSI_LEDGER_FILTERS);
  });
});

// @vitest-environment happy-dom
describe('vsi ledger URL history', () => {
  it('round-trips ledger tab via pushState and popstate', () => {
    window.history.replaceState(null, '', `/master?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}`);
    pushMasterIntelligenceUrl(
      'vsi-intelligence',
      mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
        orgId: org,
        vehicleId: vehicle,
        vsiTab: 'ledger',
        ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'engine' },
      }),
      { replace: true },
    );
    expect(window.location.search).toContain('tab=ledger');
    expect(window.location.search).toContain('q=engine');
    const parsed = parseMasterIntelligenceContext(window.location.search);
    expect(parsed.vsiTab).toBe('ledger');
    expect(parsed.ledgerFilters.q).toBe('engine');
  });
});

describe('vsi ledger filters', () => {
  const signals = [AUDI_ENGINE_RPM_SIGNAL, BEV_NOT_APPLICABLE_SIGNAL, ATTRIBUTION_LIMITED_RPM];

  it('keeps NEVER_OBSERVED separate from PROVEN_HISTORICAL_ONLY in RPM filter', () => {
    const filtered = filterSignalsForLedger(signals, {
      ...EMPTY_VSI_LEDGER_FILTERS,
      rpm: ['PROVEN_HISTORICAL_ONLY'],
    });
    expect(filtered.map((s) => s.canonicalSignalKey)).toEqual(['engine_rpm']);
    expect(filtered[0]?.empiricalObservation).toBe('NEVER_OBSERVED');
  });

  it('filters Tesla-style NOT_APPLICABLE RPM', () => {
    const filtered = filterSignalsForLedger(signals, {
      ...EMPTY_VSI_LEDGER_FILTERS,
      rpm: ['NOT_APPLICABLE'],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rpmCombinedEvidenceAvailabilityV1).toBe('NOT_APPLICABLE');
  });

  it('excludes HF filter when attribution is unproven', () => {
    expect(hasAttributableHfEvidence(AUDI_ENGINE_RPM_SIGNAL)).toBe(true);
    expect(hasAttributableHfEvidence(ATTRIBUTION_LIMITED_RPM)).toBe(false);
    const filtered = filterSignalsForLedger(signals, {
      ...EMPTY_VSI_LEDGER_FILTERS,
      hf: true,
    });
    expect(filtered.some((s) => s === ATTRIBUTION_LIMITED_RPM)).toBe(false);
  });

  it('prunes enum filters after link profile change', () => {
    const pruned = pruneLedgerFiltersForSignals(
      {
        ...EMPTY_VSI_LEDGER_FILTERS,
        rpm: ['PROVEN_LIVE', 'PROVEN_HISTORICAL_ONLY'],
      },
      [BEV_NOT_APPLICABLE_SIGNAL],
    );
    expect(pruned.rpm).toEqual([]);
  });
});
