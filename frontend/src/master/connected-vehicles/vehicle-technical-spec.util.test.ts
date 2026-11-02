import { describe, expect, it } from 'vitest';
import {
  formatFrontRearWeightDistribution,
  parseFrontWeightDistributionPct,
  parseBrakeForceFrontPercent,
} from './vehicle-technical-spec.util';
import { buildMasterVehiclePhysicsSpecPatch } from './master-vehicle-registration';
import type { RegisteredVehicle } from '../data/platform-data';

const baseRv = (): RegisteredVehicle =>
  ({
    id: 'veh-1',
    organizationId: 'org-1',
    make: 'Audi',
    model: 'A4',
    year: 2016,
    engineDisplacementCc: '',
    cylinderCount: '',
    frontToRearWeightDistribution: '',
    curbWeight: '1735',
  }) as RegisteredVehicle;

describe('vehicle technical spec persistence patch', () => {
  it('builds Audi 58/42 weight patch with confirmation', () => {
    const baseline = { ...baseRv(), frontToRearWeightDistribution: '' };
    const current = { ...baseline, frontToRearWeightDistribution: '58/42' };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.frontWeightDistributionPct).toBe(58);
    expect(patch.technicalSpecificationSave).toEqual({
      confirmedFieldKeys: ['frontToRearWeightDistribution'],
    });
  });

  it('builds Tiguan 60/40 patch', () => {
    const baseline = baseRv();
    const current = { ...baseline, frontToRearWeightDistribution: '60/40' };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.frontWeightDistributionPct).toBe(60);
  });

  it('does not patch Arteon unknown weight', () => {
    const rv = baseRv();
    const patch = buildMasterVehiclePhysicsSpecPatch(rv, rv);
    expect(patch.frontToRearWeightDistribution).toBeUndefined();
  });

  it('formats display strings', () => {
    expect(formatFrontRearWeightDistribution(58)).toBe('58/42');
    expect(parseFrontWeightDistributionPct('60/40')).toBe(60);
    expect(parseBrakeForceFrontPercent('58/42')).toBeNull();
    expect(parseBrakeForceFrontPercent('62')).toBe(62);
  });

  it('builds idle/max/brake patch with confirmation', () => {
    const baseline = { ...baseRv(), idleRpm: '', maxRpm: '', brakeForceDistribution: '' };
    const current = {
      ...baseline,
      idleRpm: '750',
      maxRpm: '6500',
      brakeForceDistribution: '62',
    };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.idleRpm).toBe(750);
    expect(patch.maxRpm).toBe(6500);
    expect(patch.brakeForceFrontPercent).toBe(62);
    expect(patch.technicalSpecificationSave).toEqual({
      confirmedFieldKeys: ['idleRpm', 'maxRpm', 'brakeForceDistribution'],
    });
  });

  it('does not patch unchanged idle/max/brake fields', () => {
    const rv = {
      ...baseRv(),
      idleRpm: '750',
      maxRpm: '6500',
      brakeForceDistribution: '62% front',
    };
    const patch = buildMasterVehiclePhysicsSpecPatch(rv, rv);
    expect(patch.idleRpm).toBeUndefined();
    expect(patch.maxRpm).toBeUndefined();
    expect(patch.brakeForceFrontPercent).toBeUndefined();
  });

  it('builds tank, interval, and drivetrain patch with confirmation', () => {
    const baseline = {
      ...baseRv(),
      tankCapacityLiters: '50',
      serviceIntervalManufacturerKm: '15000',
      oilChangeIntervalMonths: '',
      drivetrain: 'FWD',
    };
    const current = {
      ...baseline,
      tankCapacityLiters: '55',
      serviceIntervalManufacturerKm: '30000',
      oilChangeIntervalMonths: '24',
      drivetrain: 'AWD',
    };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.tankCapacityLiters).toBe(55);
    expect(patch.serviceIntervalManufacturerKm).toBe(30000);
    expect(patch.oilChangeIntervalMonths).toBe(24);
    expect(patch.drivetrain).toBe('AWD');
    expect(patch.technicalSpecificationSave).toEqual({
      confirmedFieldKeys: expect.arrayContaining([
        'tankCapacityLiters',
        'manufacturerServiceIntervalKm',
        'oilchangeIntervalMonths',
        'drivetrain',
      ]),
    });
  });
});
