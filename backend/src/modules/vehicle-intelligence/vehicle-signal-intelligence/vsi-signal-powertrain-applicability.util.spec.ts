import {
  hasHighVoltagePackApplicability,
  hasIceFuelApplicability,
  resolveVsiSignalPowertrainApplicability,
} from './vsi-signal-powertrain-applicability.util';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import { applyVsiProfileSignalPowertrainApplicability } from './vsi-signal-powertrain-applicability.util';

describe('vsi-signal-powertrain-applicability.util', () => {
  it('classifies pure EV ICE-only signals as NOT_APPLICABLE', () => {
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'ELECTRIC')).toBe('NOT_APPLICABLE');
    expect(resolveVsiSignalPowertrainApplicability('fuel_level_relative', 'ELECTRIC')).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('classifies pure ICE HV signals as NOT_APPLICABLE', () => {
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', 'GASOLINE')).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('keeps hybrid HV applicable without treating hybrid as pure ICE', () => {
    expect(hasHighVoltagePackApplicability('HYBRID')).toBe(true);
    expect(hasIceFuelApplicability('HYBRID')).toBe(true);
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', 'HYBRID')).toBe('APPLICABLE');
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'HYBRID')).toBe('APPLICABLE');
  });

  it('plugin hybrid supports both ICE and HV canonical signals', () => {
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'PLUGIN_HYBRID')).toBe(
      'APPLICABLE',
    );
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', 'PLUGIN_HYBRID')).toBe(
      'APPLICABLE',
    );
  });

  it('unknown fuel type fail-closed as UNKNOWN', () => {
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', null)).toBe('UNKNOWN');
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', undefined)).toBe('UNKNOWN');
  });

  it('OTHER fuel is ambiguous — fail-closed UNKNOWN for powertrain-gated signals', () => {
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'OTHER')).toBe('UNKNOWN');
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', 'OTHER')).toBe('UNKNOWN');
  });

  it('proven empirical observation is not downgraded when fuelType disagrees', () => {
    const applied = applyVsiProfileSignalPowertrainApplicability(
      {
        canonicalSignalKey: 'hv_battery_soc' as const,
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
        lastValidObservationAt: '2026-10-15T10:00:00.000Z',
        lastSourceTimestamp: '2026-10-15T10:00:00.000Z',
        freshnessClassification: 'FRESH' as const,
        limitations: [] as string[],
        powertrainApplicability: undefined as 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' | undefined,
      },
      'GASOLINE',
    );
    expect(applied.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(applied.powertrainApplicability).toBe('UNKNOWN');
    expect(applied.lastValidObservationAt).toBe('2026-10-15T10:00:00.000Z');
  });

  it('apply overwrites empirical axis for NOT_APPLICABLE', () => {
    const applied = applyVsiProfileSignalPowertrainApplicability(
      {
        canonicalSignalKey: 'engine_rpm' as const,
        empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
        lastValidObservationAt: '2026-01-01T00:00:00.000Z',
        lastSourceTimestamp: null,
        freshnessClassification: 'UNKNOWN' as const,
        limitations: [] as string[],
        powertrainApplicability: undefined as 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' | undefined,
      },
      'ELECTRIC',
    );
    expect(applied.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NOT_APPLICABLE);
    expect(applied.powertrainApplicability).toBe('NOT_APPLICABLE');
    expect(applied.lastValidObservationAt).toBeNull();
  });

  it('P0-a cohort fuel types match expected applicability', () => {
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'ELECTRIC')).toBe('NOT_APPLICABLE');
    expect(resolveVsiSignalPowertrainApplicability('engine_rpm', 'GASOLINE')).toBe('APPLICABLE');
    expect(resolveVsiSignalPowertrainApplicability('hv_battery_soc', 'GASOLINE')).toBe(
      'NOT_APPLICABLE',
    );
  });
});
