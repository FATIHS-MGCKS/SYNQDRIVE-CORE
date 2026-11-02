import {
  applyElectrificationHvSafety,
  applyResolvedVariantIdentityGate,
  applyVariantConfidenceGate,
  coerceHvBatteryPresent,
  normalizeDrivetrain,
  normalizeVehicleSpecValues,
} from './vehicle-spec-ai.normalize.util';

describe('vehicle-spec-ai.normalize.util', () => {
  it('coerces hvBatteryPresent to boolean', () => {
    expect(coerceHvBatteryPresent(1)).toBe(true);
    expect(coerceHvBatteryPresent(0)).toBe(false);
    expect(coerceHvBatteryPresent('true')).toBe(true);
    expect(coerceHvBatteryPresent('bogus')).toBeNull();
  });

  it('normalizes drivetrain including 4WD alias', () => {
    expect(normalizeDrivetrain('4WD')).toBe('FOUR_WD');
    expect(normalizeDrivetrain('fwd')).toBe('FWD');
    expect(normalizeDrivetrain('unknown')).toBeNull();
  });

  it('nulls variant-dependent numerics when confidence is low', () => {
    const specs: Record<string, string | number | boolean | null> = {
      variantConfidence: 0.4,
      curbWeightKg: 1800,
      systemMotorPowerKw: 150,
    };
    const rejected = applyVariantConfidenceGate(specs);
    expect(rejected.length).toBeGreaterThan(0);
    expect(specs.curbWeightKg).toBeNull();
    expect(specs.systemMotorPowerKw).toBeNull();
  });

  it('nulls variant numerics when resolvedVariant does not match vehicle identity', () => {
    const specs: Record<string, string | number | boolean | null> = {
      resolvedVariant: 'Completely Different Model XYZ',
      variantConfidence: 0.95,
      curbWeightKg: 1900,
      systemMotorPowerKw: 120,
    };
    const rejected = applyResolvedVariantIdentityGate(specs, {
      make: 'Volkswagen',
      model: 'Arteon',
      year: 2022,
    });
    expect(rejected).toContain('identity:resolved_variant_context_mismatch');
    expect(specs.curbWeightKg).toBeNull();
    expect(specs.systemMotorPowerKw).toBeNull();
  });

  it('normalizes lv battery type aliases onto batteryType', () => {
    const specs = normalizeVehicleSpecValues({
      lvBatteryType: 'Lead-Acid',
      batteryType: null,
    });
    expect(specs.lvBatteryType).toBe('LEAD_ACID');
    expect(specs.batteryType).toBe('LEAD_ACID');
    expect(
      normalizeVehicleSpecValues({ lvBatteryType: 'unknown-brand', batteryType: 'AGM' }).batteryType,
    ).toBeNull();
  });

  it('clears HV capacity fields for MHEV electrification level', () => {
    const specs = normalizeVehicleSpecValues({
      electrificationLevel: 'MHEV_48V',
      hvBatteryUsableCapacityKwh: 15,
      hvBatteryPresent: true,
    });
    expect(specs.hvBatteryPresent).toBe(false);
    expect(specs.hvBatteryUsableCapacityKwh).toBeNull();
  });
});
