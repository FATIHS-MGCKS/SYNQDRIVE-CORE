import { describe, expect, it } from 'vitest';
import {
  buildTechnicalSpecsView,
  driveTypeLabelKey,
  isPureElectricFuelLabel,
  motionPhysicsEvidenceTierLabelKey,
  normalizeDriveType,
  resolveMotionReferenceFieldProvenance,
  specValueState,
} from './connected-vehicle-technical-specs.util';

describe('connected-vehicle-technical-specs.util', () => {
  it('prefers active reference over legacy vehicle values when reference exists', () => {
    const view = buildTechnicalSpecsView({
      make: 'VW',
      model: 'Tiguan',
      year: 2021,
      fuelType: 'Gasoline',
      drivetrain: 'AWD',
      curbWeight: '1750',
      systemMotorPowerKw: '100',
      accel0To100S: '10',
      motionReference: {
        curbMassKg: 1800,
        systemMotorPowerKw: 110,
        accel0To100S: 9.2,
        variantAssumption: '2.0 TSI',
      },
    });
    expect(view.curbWeightKg).toBe(1800);
    expect(view.systemMotorPowerKw).toBe(110);
    expect(view.driveTypeNormalized).toBe('AWD');
    expect(view.fuelType).toBe('Gasoline');
  });

  it('separates fuel type from drivetrain and maps FWD/RWD/AWD/FOUR_WD', () => {
    expect(normalizeDriveType('FWD')).toBe('FWD');
    expect(normalizeDriveType('4WD')).toBe('FOUR_WD');
    expect(normalizeDriveType('')).toBeNull();
    expect(driveTypeLabelKey('RWD')).toBe('master.cv.technicalSpecs.driveType.rwd');
    expect(driveTypeLabelKey('invalid')).toBe('master.cv.technicalSpecs.driveType.unknown');

    const view = buildTechnicalSpecsView({
      fuelType: 'Diesel',
      drivetrain: 'FOUR_WD',
    });
    expect(view.fuelType).toBe('Diesel');
    expect(view.driveTypeNormalized).toBe('FOUR_WD');
  });

  it('gates ICE-only fields for pure electric vehicles', () => {
    const ev = buildTechnicalSpecsView({ fuelType: 'Electric', drivetrain: 'RWD' });
    expect(ev.applicability.showIceEngineFields).toBe(false);
    expect(ev.applicability.showTankAndOilMaintenance).toBe(false);
    expect(ev.applicability.showHvBatteryFields).toBe(true);
    expect(specValueState(ev.applicability.showTankAndOilMaintenance, false)).toBe('not_applicable');
  });

  it('surfaces persisted maintenance and reference dimensions when present', () => {
    const view = buildTechnicalSpecsView({
      fuelType: 'Gasoline',
      tankCapacityLiters: '55',
      serviceIntervalManufacturerKm: '30000',
      tireFrontDimension: '235/55 R19',
      brakeFrontRotorDiameter: '340',
      batteryType: 'AGM',
      batteryAmpere: '70',
      batteryVolt: '12',
    });
    expect(view.tankCapacityLiters).toBe(55);
    expect(view.serviceIntervalManufacturerKm).toBe(30000);
    expect(view.tireFrontDimension).toBe('235/55 R19');
    expect(view.brakeFrontRotorDiameterMm).toBe(340);
    expect(view.batteryType).toBe('AGM');
  });

  it('maps USER_CONFIRMED provenance from registration identity document', () => {
    const view = buildTechnicalSpecsView({
      fuelType: 'Gasoline',
      registrationIdentityProvenance: {
        version: 1,
        fields: {
          idleRpm: { provenance: 'MANUAL', confirmationStatus: 'USER_CONFIRMED' },
        },
      },
      idleRpm: '750',
    });
    expect(view.fieldProvenance.idleRpm).toBe('USER_CONFIRMED');
  });

  it('falls back to legacy vehicle fields when no reference values', () => {
    const view = buildTechnicalSpecsView({
      make: 'Tesla',
      model: 'Model 3',
      fuelType: 'Electric',
      curbWeight: '1847',
      systemMotorPowerKw: '210',
      accel0To100S: '5.8',
    });
    expect(view.curbWeightKg).toBe(1847);
    expect(isPureElectricFuelLabel(view.fuelType)).toBe(true);
  });

  it('maps evidence tier to i18n keys', () => {
    expect(motionPhysicsEvidenceTierLabelKey('ESTIMATED')).toBe('master.motionPhysics.evidence.estimated');
    expect(motionPhysicsEvidenceTierLabelKey(null)).toBe('master.cv.technicalSpecs.noReference');
  });

  it('maps CONFIRMED motion tier to user-confirmed power provenance, not AI', () => {
    const view = buildTechnicalSpecsView({
      fuelType: 'Electric',
      systemMotorPowerKw: '210',
      motionEvidenceTier: 'CONFIRMED',
    });
    expect(view.fieldProvenance.systemMotorPowerKw).toBe('USER_CONFIRMED');
    expect(resolveMotionReferenceFieldProvenance(null, 'ESTIMATED')).toBe('AI_SUGGESTED');
    expect(resolveMotionReferenceFieldProvenance(null, 'CONFIRMED')).toBe('USER_CONFIRMED');
    expect(resolveMotionReferenceFieldProvenance(null, null)).toBeNull();
  });

  it('does not attach provenance to fields without stored identity or motion tier', () => {
    const view = buildTechnicalSpecsView({
      fuelType: 'Gasoline',
      idleRpm: '750',
    });
    expect(view.fieldProvenance.idleRpm).toBeNull();
    expect(view.fieldProvenance.systemMotorPowerKw).toBeUndefined();
  });
});
