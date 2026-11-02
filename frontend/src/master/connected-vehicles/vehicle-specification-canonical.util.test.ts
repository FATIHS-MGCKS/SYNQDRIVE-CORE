import { describe, expect, it } from 'vitest';
import {
  deriveElectrificationLevelReadOnly,
  normalizeCanonicalDrivetrain,
  normalizeLvBatteryTypeInput,
  resolveRegistrationLvBatteryForSubmit,
  resolveRegistrationLvBatteryFormState,
  stripNonPersistentVehicleSpecFields,
} from './vehicle-specification-canonical.util';

describe('vehicle-specification-canonical.util', () => {
  it('normalizes drivetrain aliases consistently with backend contract', () => {
    expect(normalizeCanonicalDrivetrain('Allrad')).toBe('FOUR_WD');
    expect(normalizeCanonicalDrivetrain('AWD')).toBe('AWD');
  });

  it('normalizes LV battery type or returns null', () => {
    expect(normalizeLvBatteryTypeInput('AGM')).toBe('AGM');
    expect(normalizeLvBatteryTypeInput('unknown chemistry')).toBeNull();
  });

  it('strips non-persistent registration fields', () => {
    expect(
      stripNonPersistentVehicleSpecFields({
        fuelType: 'Gasoline',
        electrificationLevel: 'BEV',
        lvBatteryChemistry: 'Lead',
      }),
    ).toEqual({ fuelType: 'Gasoline' });
  });

  it('derives electrification read-only without persisting user guesses', () => {
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Diesel' })).toBe('NONE');
    expect(deriveElectrificationLevelReadOnly({ fuelType: 'Electric' })).toBe('BEV');
  });

  it('preserves legacy battery labels until canonical selection', () => {
    expect(resolveRegistrationLvBatteryFormState('custom legacy')).toEqual({
      selectValue: '',
      legacyDisplay: 'custom legacy',
    });
    expect(resolveRegistrationLvBatteryFormState('Lead-Acid')).toEqual({
      selectValue: 'LEAD_ACID',
      legacyDisplay: null,
    });
  });

  it('blocks submit when numbers present without canonical type', () => {
    expect(
      resolveRegistrationLvBatteryForSubmit({
        typeRaw: '',
        ampereRaw: '70',
        voltRaw: '12',
      }).validationError,
    ).toBe('lvBatteryTypeRequiredForNumbers');
  });
});
