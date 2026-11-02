import { buildVehicleSystemBaseline } from './vehicle-identity-baseline.util';
import { validateVehicleIdentityFieldConfirmations } from './vehicle-identity-confirm.util';
import { buildVehicleIdentityReviewSnapshot } from './vehicle-identity-reconcile.util';

describe('vehicle-identity-confirm.util', () => {
  const capabilities = {
    p2Enabled: true,
    p3Enabled: false,
    zb1UploadEnabled: false,
    documentStoragePolicyAcknowledged: false,
  };

  const emptySystem = buildVehicleSystemBaseline({
    vin: '1HGCM82633A004352',
    make: 'VW',
    model: 'Golf',
    fuelType: 'Gasoline',
    hasDimoProviderLink: true,
    motionReference: null,
  });

  it('rejects confirmation when VIN mismatch is not acknowledged', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      system: emptySystem,
      zb1: null,
      manual: null,
      documentExtractionId: null,
      capabilities,
      vinMismatchAcknowledged: false,
    });
    snapshot.vinMismatchBlocked = true;

    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true }],
      vinMismatchAcknowledged: false,
      acceptP2AsSystemPower: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'VIN_MISMATCH_UNACKNOWLEDGED')).toBe(true);
  });

  it('blocks document field confirmation when FIN mismatch is acknowledged but document FIN differs', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      system: emptySystem,
      zb1: null,
      manual: null,
      documentExtractionId: 'ext-1',
      capabilities,
      vinMismatchAcknowledged: true,
    });
    snapshot.vinMismatchBlocked = true;
    const field = snapshot.fields.find((f) => f.fieldCode === 'p1DisplacementCc');
    if (field) {
      field.documentValue = 1998;
      field.extractionStatus = 'EXTRACTED';
    }

    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'p1DisplacementCc', confirmed: true }],
      vinMismatchAcknowledged: true,
      acceptP2AsSystemPower: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'VIN_MISMATCH_DOCUMENT_FIELD_BLOCKED')).toBe(true);
  });

  it('blocks confirming document FIN that differs from vehicle FIN even when acknowledged', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      system: emptySystem,
      zb1: null,
      manual: null,
      documentExtractionId: 'ext-1',
      capabilities,
      vinMismatchAcknowledged: true,
    });
    snapshot.vinMismatchBlocked = true;
    const eVin = snapshot.fields.find((f) => f.fieldCode === 'eVin');
    if (eVin) {
      eVin.documentValue = 'OTHERVIN123456789';
      eVin.extractionStatus = 'EXTRACTED';
      eVin.baselineValue = '1HGCM82633A004352';
    }

    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'eVin', confirmed: true }],
      vinMismatchAcknowledged: true,
      acceptP2AsSystemPower: false,
    });
    expect(result.errors.some((e) => e.code === 'VIN_MISMATCH_DOCUMENT_VIN_NOT_CANONICAL')).toBe(true);
  });

  it('rejects correctedValue without confirmed: true', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      system: emptySystem,
      zb1: null,
      manual: null,
      documentExtractionId: null,
      capabilities,
    });
    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: false, correctedValue: 'VW' }],
      vinMismatchAcknowledged: false,
      acceptP2AsSystemPower: false,
    });
    expect(result.errors.some((e) => e.code === 'CORRECTED_WITHOUT_CONFIRMATION')).toBe(true);
  });

  it('rejects P.2 as system power', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      system: buildVehicleSystemBaseline({
        vin: null,
        make: null,
        model: null,
        fuelType: null,
        hasDimoProviderLink: false,
        motionReference: null,
      }),
      zb1: null,
      manual: { motorPowerKw: 110 },
      documentExtractionId: null,
      capabilities,
    });
    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'p2NominalPowerKw', confirmed: true }],
      vinMismatchAcknowledged: false,
      acceptP2AsSystemPower: true,
    });
    expect(result.errors.some((e) => e.code === 'P2_SYSTEM_POWER_NOT_ALLOWED')).toBe(true);
  });
});
