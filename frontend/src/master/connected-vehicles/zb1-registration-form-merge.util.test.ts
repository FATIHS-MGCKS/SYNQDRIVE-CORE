import { describe, expect, it } from 'vitest';
import { buildZb1RegistrationFormPatch } from './zb1-registration-form-merge.util';

describe('buildZb1RegistrationFormPatch', () => {
  const emptyCurrent = {
    engineDisplacementCc: '',
    fuelType: '',
    curbWeight: '',
  };

  it('blocks when VIN mismatch not acknowledged', () => {
    const result = buildZb1RegistrationFormPatch(
      [
        {
          fieldCode: 'p1DisplacementCc',
          value: 1968,
          conflict: false,
          baselineValue: null,
        },
      ],
      { p1DisplacementCc: true },
      emptyCurrent,
      { vinMismatchBlocked: true, vinMismatchAcknowledged: false },
    );
    expect(result.blockedReason).toBe('VIN_MISMATCH');
    expect(result.patch).toEqual({});
  });

  it('applies confirmed displacement and fuel when fields empty', () => {
    const result = buildZb1RegistrationFormPatch(
      [
        { fieldCode: 'p1DisplacementCc', value: 1968, conflict: false, baselineValue: null },
        { fieldCode: 'p3FuelOrEnergy', value: 'Diesel', conflict: false, baselineValue: null },
        { fieldCode: 'eVin', value: 'WVWZZZ3CZWE123456', conflict: true, baselineValue: 'OTHER' },
      ],
      { p1DisplacementCc: true, p3FuelOrEnergy: true, eVin: true },
      emptyCurrent,
      { vinMismatchBlocked: false, vinMismatchAcknowledged: false },
    );
    expect(result.patch).toEqual({
      engineDisplacementCc: '1968',
      fuelType: 'Diesel',
    });
  });

  it('blocks apply when FIN mismatch is flagged even after acknowledgment', () => {
    const result = buildZb1RegistrationFormPatch(
      [{ fieldCode: 'p1DisplacementCc', value: 1968, conflict: false, baselineValue: null }],
      { p1DisplacementCc: true },
      emptyCurrent,
      { vinMismatchBlocked: true, vinMismatchAcknowledged: true },
    );
    expect(result.blockedReason).toBe('VIN_MISMATCH');
    expect(result.patch).toEqual({});
  });

  it('applies confirmed value over existing specification when user confirmed the field', () => {
    const result = buildZb1RegistrationFormPatch(
      [{ fieldCode: 'p1DisplacementCc', value: 1968, conflict: true, baselineValue: 1400 }],
      { p1DisplacementCc: true },
      { ...emptyCurrent, engineDisplacementCc: '1400' },
      { vinMismatchBlocked: false, vinMismatchAcknowledged: false },
    );
    expect(result.patch).toEqual({ engineDisplacementCc: '1968' });
  });
});
