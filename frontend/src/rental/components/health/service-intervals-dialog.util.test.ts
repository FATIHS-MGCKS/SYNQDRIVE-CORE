import { describe, expect, it } from 'vitest';
import {
  buildPartialIntervalPatch,
  formValuesFromSnapshot,
  inspectionIntervalLane,
  type IntervalFormField,
  type VehicleIntervalSnapshot,
} from './service-intervals-dialog.util';

const BASE: VehicleIntervalSnapshot = {
  serviceIntervalManufacturerKm: 30_000,
  serviceIntervalManufacturerMonths: 24,
  serviceIntervalKm: 15_000,
  serviceIntervalMonths: 12,
  oilChangeIntervalKm: 20_000,
  oilChangeIntervalMonths: 24,
};

describe('service-intervals-dialog.util', () => {
  it('prefers manufacturer inspection values for display', () => {
    expect(inspectionIntervalLane(BASE)).toEqual({
      usesManufacturer: true,
      km: 30_000,
      months: 24,
    });
    expect(formValuesFromSnapshot(BASE).serviceIntervalKm).toBe('30000');
  });

  it('partial patch updates only dirty manufacturer inspection fields', () => {
    const dirty = new Set<IntervalFormField>(['serviceIntervalKm']);
    const values = { ...formValuesFromSnapshot(BASE), serviceIntervalKm: '32000' };
    const patch = buildPartialIntervalPatch(BASE, values, dirty);
    expect(patch).toEqual({ serviceIntervalManufacturerKm: 32_000 });
    expect(patch).not.toHaveProperty('serviceIntervalKm');
    expect(patch).not.toHaveProperty('oilChangeIntervalKm');
  });

  it('partial patch touches generic lane when manufacturer absent', () => {
    const loaded: VehicleIntervalSnapshot = {
      ...BASE,
      serviceIntervalManufacturerKm: null,
      serviceIntervalManufacturerMonths: null,
    };
    const dirty = new Set<IntervalFormField>(['serviceIntervalMonths']);
    const values = { ...formValuesFromSnapshot(loaded), serviceIntervalMonths: '18' };
    expect(buildPartialIntervalPatch(loaded, values, dirty)).toEqual({ serviceIntervalMonths: 18 });
  });

  it('oil intervals patch only when dirty', () => {
    const dirty = new Set<IntervalFormField>(['oilChangeIntervalKm']);
    const values = { ...formValuesFromSnapshot(BASE), oilChangeIntervalKm: '25000' };
    const patch = buildPartialIntervalPatch(BASE, values, dirty);
    expect(patch).toEqual({ oilChangeIntervalKm: 25_000 });
    expect(Object.keys(patch)).toHaveLength(1);
  });
});
