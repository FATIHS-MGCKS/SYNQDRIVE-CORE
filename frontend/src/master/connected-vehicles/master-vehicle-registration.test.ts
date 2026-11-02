import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyManualBaselinesAfterCreate,
  buildMasterHvCapacityExtraFields,
  buildMasterVehicleHvStammdatenDiff,
  buildMasterVehiclePhysicsSpecPatch,
  buildVehicleExtraData,
  buildVehicleManualSpecs,
  mapAdminVehicleDtoToRegisteredVehicle,
  resolveAdminDtoHvUsableCapacityKwh,
  mapApiDimoToDimoVehicle,
  persistMasterRegisteredVehicle,
  updateMasterRegisteredVehicle,
} from './master-vehicle-registration';
import { api } from '../../lib/api';

const createMock = vi.fn();
const registerFromDimoMock = vi.fn();
const upsertTiresMock = vi.fn();
const updateMock = vi.fn();
vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      registerFromDimo: (...args: unknown[]) => registerFromDimoMock(...args),
      upsertTires: (...args: unknown[]) => upsertTiresMock(...args),
    },
    vehicleIntelligence: {
      createBatterySpec: vi.fn().mockResolvedValue({}),
      updateBatterySpec: vi.fn().mockResolvedValue({}),
      createBrakeSpec: vi.fn().mockResolvedValue({}),
      updateBrakeSpec: vi.fn().mockResolvedValue({}),
      battery: vi.fn().mockResolvedValue([]),
      brakes: vi.fn().mockResolvedValue([]),
      brakeHealthInitialize: vi.fn().mockResolvedValue({}),
      recordBrakeService: vi.fn().mockResolvedValue({}),
    },
  },
}));
import type { RegisteredVehicle } from '../data/platform-data';

function minimalRv(overrides: Partial<RegisteredVehicle> = {}): RegisteredVehicle {
  return {
    id: 'rv-1',
    vehicleName: 'VW ID.4',
    vin: 'WVWZZZ1JZXW000001',
    make: 'Volkswagen',
    model: 'ID.4',
    year: 2024,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 12000,
    licensePlate: 'B-AB 123',
    vehicleType: 'SUV',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    tireFrontDimension: '235/55 R19',
    tireFrontBrandModel: '',
    tireFrontSeason: 'All Season',
    tireFrontDot: '',
    tireFrontLoadIndex: '',
    tireFrontSpeedIndex: '',
    tireBackDimension: '',
    tireBackBrandModel: '',
    tireBackSeason: 'All Season',
    tireBackDot: '',
    tireBackLoadIndex: '',
    tireBackSpeedIndex: '',
    treadDepthFL: '6',
    treadDepthFR: '',
    treadDepthBL: '',
    treadDepthBR: '',
    brakeFrontRotorDiameter: '',
    brakeFrontRotorWidth: '',
    brakeFrontPadThickness: '10',
    brakeBackRotorDiameter: '',
    brakeBackRotorWidth: '',
    brakeBackPadThickness: '',
    idleRpm: '',
    maxRpm: '',
    drivetrain: '',
    brakeForceDistribution: '',
    frontToRearWeightDistribution: '',
    curbWeight: '',
    serviceIntervals: '',
    serviceIntervalManufacturerKm: '',
    serviceIntervalManufacturerMonths: '',
    oilChangeIntervalKm: '',
    oilChangeIntervalMonths: '',
    lastTuev: '',
    lastBokraft: '',
    lastInspection: '',
    lastOilChange: '',
    lastBrakePadChange: '',
    lastBrakeRotorChange: '',
    hardwareType: 'UNKNOWN',
    ...overrides,
  };
}

describe('master-vehicle-registration payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps DIMO API rows to DimoVehicle', () => {
    const mapped = mapApiDimoToDimoVehicle({
      id: 'd1',
      vin: 'VIN1',
      make: 'BMW',
      model: 'i3',
      year: 2022,
      odometer: 5000,
      connectionStatus: 'Connected',
    });
    expect(mapped.id).toBe('d1');
    expect(mapped.vin).toBe('VIN1');
    expect(mapped.connectionStatus).toBe('Connected');
  });

  it('includes motion physics fields in extraData when set', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        curbWeight: '1800',
        systemMotorPowerKw: '150',
        accel0To100S: '5.4',
        motionPhysicsVariantAssumption: 'base variant',
      }),
    );
    expect(extra).toMatchObject({
      curbWeightKg: 1800,
      systemMotorPowerKw: 150,
      accel0To100S: 5.4,
      motionPhysicsVariantAssumption: 'base variant',
    });
  });

  it('does not persist non-durable electrificationLevel or chemistry in register extraData', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        electrificationLevel: 'BEV',
        lvBatteryChemistry: 'Lead-Acid prose',
        drivetrain: '4WD',
      }),
    );
    expect(extra.electrificationLevel).toBeUndefined();
    expect(extra.lvBatteryChemistry).toBeUndefined();
    expect(extra.drivetrain).toBe('FOUR_WD');
  });

  it('omits manual battery baseline when type is legacy-unknown', () => {
    const specs = buildVehicleManualSpecs(
      minimalRv({ batteryType: 'legacy-custom-label', batteryAmpere: '70', batteryVolt: '12' }),
    );
    expect(specs?.battery).toBeUndefined();
  });

  it('includes manual battery baseline only for canonical normalized type', () => {
    const specs = buildVehicleManualSpecs(minimalRv({ batteryType: 'AGM', batteryAmpere: '70' }));
    expect(specs?.battery).toMatchObject({ batteryType: 'AGM', batteryAmpere: 70 });
  });

  it('merges aiFieldProvenance into extraData when provided on registered vehicle', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        aiFieldProvenance: {
          curbWeightKg: { category: 'AI_ESTIMATED', confidence: 0.7 },
        },
      }),
    );
    expect(extra.aiFieldProvenance).toEqual({
      curbWeightKg: { category: 'AI_ESTIMATED', confidence: 0.7 },
    });
  });

  it('builds extraData with org-scoped mileage and hardware', () => {
    const extra = buildVehicleExtraData(minimalRv({ hardwareType: 'LTE_R1', mileage: 1500 }));
    expect(extra.mileageKm).toBe(1500);
    expect(extra.hardwareType).toBe('LTE_R1');
    expect(extra.licensePlate).toBe('B-AB 123');
  });

  it('includes separated HV usable and gross fields for BEV extraData', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        hvBatteryUsableCapacityKwh: '55.2',
        hvBatteryGrossCapacityKwh: '57',
      }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBe(55.2);
    expect(extra.hvBatteryGrossCapacityKwh).toBe(57);
    expect(extra.hvBatteryCapacityKwh).toBeUndefined();
  });

  it('maps legacy hvBatteryCapacityKwh to usable-only extra field', () => {
    const extra = buildVehicleExtraData(
      minimalRv({ hvBatteryCapacityKwh: '57', hvBatteryUsableCapacityKwh: '' }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBe(57);
    expect(extra.hvBatteryGrossCapacityKwh).toBeUndefined();
  });

  it('omits HV capacity extra fields for ICE fuel types', () => {
    const fields = buildMasterHvCapacityExtraFields(
      minimalRv({ fuelType: 'Gasoline', hvBatteryUsableCapacityKwh: '60' }),
    );
    expect(fields).toEqual({});
  });

  it('does not promote gross-only to usable in extraData', () => {
    const extra = buildVehicleExtraData(
      minimalRv({ hvBatteryGrossCapacityKwh: '60', hvBatteryUsableCapacityKwh: '' }),
    );
    expect(extra.hvBatteryUsableCapacityKwh).toBeUndefined();
    expect(extra.hvBatteryGrossCapacityKwh).toBe(60);
  });

  it('includes technicalSpecificationSave on register extraData when spec fields are set', () => {
    const extra = buildVehicleExtraData(
      minimalRv({
        tankCapacityLiters: '55',
        drivetrain: 'AWD',
        idleRpm: '750',
      }),
    );
    expect(extra.technicalSpecificationSave).toEqual({
      confirmedFieldKeys: expect.arrayContaining([
        'tankCapacityLiters',
        'drivetrain',
        'idleRpm',
      ]),
    });
  });

  it('applyManualBaselinesAfterCreate calls tire and battery APIs without unconfirmed brake init', async () => {
    await applyManualBaselinesAfterCreate(
      'org-1',
      'veh-1',
      minimalRv({ batteryType: 'AGM', batteryAmpere: '70', batteryVolt: '12' }),
    );
    expect(upsertTiresMock).toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBatterySpec).toHaveBeenCalled();
    expect(api.vehicleIntelligence.brakeHealthInitialize).not.toHaveBeenCalled();
  });

  it('buildMasterHvCapacityExtraFields skips MHEV electrification level', () => {
    const fields = buildMasterHvCapacityExtraFields(
      minimalRv({
        fuelType: 'Hybrid',
        electrificationLevel: 'MHEV_48V',
        hvBatteryUsableCapacityKwh: '1.5',
      }),
    );
    expect(fields).toEqual({});
  });

  it('builds manualSpecs when brake or tire data present', () => {
    const specs = buildVehicleManualSpecs(minimalRv());
    expect(specs?.brakes).toBeTruthy();
    expect(specs?.tires).toBeTruthy();
    expect((specs?.tires as { treadFL?: number }).treadFL).toBe(6);
  });

  it('persistMasterRegisteredVehicle returns vehicleId when baselines fail (partial success)', async () => {
    createMock.mockResolvedValueOnce({ id: 'veh-partial-1' });
    upsertTiresMock.mockRejectedValueOnce(new Error('tires API down'));

    const result = await persistMasterRegisteredVehicle(minimalRv());

    expect(result.vehicleId).toBe('veh-partial-1');
    expect(result.baselineFailures?.some((f) => f.area === 'tires')).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('persistMasterRegisteredVehicle forwards HV usable in registerFromDimo extraData', async () => {
    registerFromDimoMock.mockResolvedValueOnce({ vehicle: { id: 'veh-hv-1' } });
    await persistMasterRegisteredVehicle(
      minimalRv({ hvBatteryUsableCapacityKwh: '55.2', hvBatteryGrossCapacityKwh: '57' }),
      { dimoVehicleId: 'dimo-hv' },
    );
    expect(registerFromDimoMock).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        dimoVehicleId: 'dimo-hv',
        extraData: expect.objectContaining({
          hvBatteryUsableCapacityKwh: 55.2,
          hvBatteryGrossCapacityKwh: 57,
        }),
      }),
    );
  });

  it('persistMasterRegisteredVehicle propagates register-from-dimo full success', async () => {
    registerFromDimoMock.mockResolvedValueOnce({
      vehicle: { id: 'veh-dimo-1' },
    });

    const result = await persistMasterRegisteredVehicle(minimalRv(), {
      dimoVehicleId: 'dimo-abc',
    });

    expect(result.vehicleId).toBe('veh-dimo-1');
    expect(result.postActivationEnrichment).toBeUndefined();
    expect(registerFromDimoMock).toHaveBeenCalledTimes(1);
  });

  it('buildMasterVehiclePhysicsSpecPatch only includes changed curb mass (Tesla motor-only edit)', () => {
    const baseline = minimalRv({
      make: 'Tesla',
      model: 'Model 3',
      fuelType: 'Electric',
      curbWeight: '1847',
      systemMotorPowerKw: '250',
    });
    const current = minimalRv({
      ...baseline,
      systemMotorPowerKw: '300',
    });
    expect(buildMasterVehiclePhysicsSpecPatch(current, baseline)).toEqual({});
  });

  it('buildMasterVehiclePhysicsSpecPatch includes curb mass delta (VW)', () => {
    const baseline = minimalRv({ make: 'Volkswagen', model: 'Tiguan', curbWeight: '1750' });
    const current = minimalRv({ ...baseline, curbWeight: '1780' });
    expect(buildMasterVehiclePhysicsSpecPatch(current, baseline)).toEqual({ curbWeightKg: 1780 });
  });

  it('buildMasterVehiclePhysicsSpecPatch never sends display fuel labels (Audi)', () => {
    const baseline = minimalRv({
      make: 'Audi',
      model: 'e-tron',
      fuelType: 'Electric',
      curbWeight: '2490',
    });
    const current = minimalRv({
      ...baseline,
      fuelType: 'Plugin Hybrid',
      mileage: 99999,
      hardwareType: 'LTE_R1',
    });
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch).toEqual({});
    expect(patch).not.toHaveProperty('fuelType');
    expect(patch).not.toHaveProperty('mileageKm');
    expect(patch).not.toHaveProperty('hardwareType');
  });

  it('mapAdminVehicleDtoToRegisteredVehicle avoids Other/UNKNOWN defaults for sparse admin DTO', () => {
    const rv = mapAdminVehicleDtoToRegisteredVehicle({
      id: 'v-sparse',
      organizationId: 'org-1',
      make: 'Audi',
      model: 'Q4',
    });
    expect(rv.fuelType).toBe('');
    expect(rv.mileage).toBe(0);
    expect(buildMasterVehiclePhysicsSpecPatch(rv, rv)).toEqual({});
  });

  it('resolveAdminDtoHvUsableCapacityKwh maps legacy hvBatteryCapacityKwh for Tesla-like admin DTO', () => {
    expect(
      resolveAdminDtoHvUsableCapacityKwh({
        hvBatteryCapacityKwh: 57,
        fuelType: 'Electric',
      }),
    ).toBe('57');
    const rv = mapAdminVehicleDtoToRegisteredVehicle({
      id: 'tesla-1',
      organizationId: 'org-1',
      make: 'Tesla',
      model: 'Model 3',
      year: 2023,
      fuelType: 'Electric',
      hvBatteryCapacityKwh: 57,
    });
    expect(rv.hvBatteryUsableCapacityKwh).toBe('57');
    expect(rv.hvBatteryCapacityKwh).toBe('57');
    expect(buildMasterVehicleHvStammdatenDiff(rv, rv).vehiclePatch).toEqual({});
  });

  it('buildMasterVehicleHvStammdatenDiff PATCHes usable scalar and flags reference create on change', () => {
    const baseline = minimalRv({
      fuelType: 'Electric',
      hvBatteryUsableCapacityKwh: '57',
      hvBatteryCapacityKwh: '57',
    });
    const current = minimalRv({
      fuelType: 'Electric',
      hvBatteryUsableCapacityKwh: '58',
      hvBatteryCapacityKwh: '58',
    });
    const diff = buildMasterVehicleHvStammdatenDiff(current, baseline);
    expect(diff.vehiclePatch).toEqual({ hvBatteryCapacityKwh: 58 });
    expect(diff.usableReferenceChanged).toBe(true);
    expect(diff.usableReferenceKwh).toBe(58);
  });

  it('updateMasterRegisteredVehicle does not PATCH HV or create battery reference on spec edit', async () => {
    const baseline = minimalRv({
      fuelType: 'Electric',
      hvBatteryUsableCapacityKwh: '57',
      curbWeight: '1760',
    });
    const current = minimalRv({
      fuelType: 'Electric',
      hvBatteryUsableCapacityKwh: '58',
      curbWeight: '1760',
    });

    await updateMasterRegisteredVehicle(current, { baseline });

    expect(updateMock).not.toHaveBeenCalled();
    expect(upsertTiresMock).not.toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBatterySpec).not.toHaveBeenCalled();
  });

  it('updateMasterRegisteredVehicle persists HV master spec via admin endpoint', async () => {
    const upsertHvMock = vi.fn().mockResolvedValue({});
    (api.vehicles as { upsertHvMasterSpecification?: typeof upsertHvMock }).upsertHvMasterSpecification =
      upsertHvMock;
    const baseline = minimalRv({ hvBatteryChemistry: '' });
    const current = minimalRv({ hvBatteryChemistry: 'LFP', hvBatteryGrossCapacityKwh: '60' });

    await updateMasterRegisteredVehicle(current, { baseline });

    expect(upsertHvMock).toHaveBeenCalledWith(
      'rv-1',
      expect.objectContaining({
        chemistry: 'LFP',
        grossCapacityKwh: 60,
        provenance: 'ESTIMATED',
      }),
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('mapAdminVehicleDtoToRegisteredVehicle maps connection identity fields from admin GET', () => {
    const rv = mapAdminVehicleDtoToRegisteredVehicle({
      id: 'tesla-1',
      organizationId: 'org-1',
      make: 'Tesla',
      model: 'Model 3',
      hardwareType: 'LTE_R1',
      connectionModality: 'SOFTWARE_INTEGRATION',
      telemetryConnectionFamily: 'API_SYNTHETIC',
    });
    expect(rv.hardwareType).toBe('LTE_R1');
    expect(rv.connectionModality).toBe('SOFTWARE_INTEGRATION');
    expect(rv.telemetryConnectionFamily).toBe('API_SYNTHETIC');
  });

  it('mapAdminVehicleDtoToRegisteredVehicle preserves motion physics form fields', () => {
    const rv = mapAdminVehicleDtoToRegisteredVehicle({
      id: 'v-1',
      organizationId: 'org-1',
      make: 'BMW',
      model: 'i4',
      year: 2023,
      fuelType: 'Electric',
      curbWeight: '2100',
      systemMotorPowerKw: '250',
      accel0To100S: '5.7',
      motionPhysicsVariantAssumption: 'M50',
    });
    expect(rv.systemMotorPowerKw).toBe('250');
    expect(rv.motionPhysicsVariantAssumption).toBe('M50');
  });

  it('updateMasterRegisteredVehicle PATCHes physics diff and applies manual baseline APIs when specs change', async () => {
    updateMock.mockResolvedValueOnce({});
    const baseline = minimalRv({
      curbWeight: '1400',
      systemMotorPowerKw: '110',
      tireFrontDimension: '225/45 R17',
    });
    const current = minimalRv({
      curbWeight: '1450',
      systemMotorPowerKw: '150',
      tireFrontDimension: '235/45 R18',
      batteryType: 'AGM',
      batteryAmpere: '70',
      batteryVolt: '12',
      brakeFrontPadThickness: '12',
    });

    await updateMasterRegisteredVehicle(current, { baseline });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('org-1', 'rv-1', { curbWeightKg: 1450 });
    expect(upsertTiresMock).toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBatterySpec).toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBrakeSpec).toHaveBeenCalled();
  });

  it('updateMasterRegisteredVehicle updates existing LV/brake rows when present', async () => {
    updateMock.mockResolvedValueOnce({});
    vi.mocked(api.vehicleIntelligence.battery).mockResolvedValueOnce([
      { id: 'bat-existing', sourceType: 'MANUAL', createdAt: '2026-01-01' },
    ]);
    vi.mocked(api.vehicleIntelligence.brakes).mockResolvedValueOnce([
      { id: 'brk-existing', userConfirmedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01' },
    ]);

    const baseline = minimalRv({ brakeFrontPadThickness: '10' });
    const current = minimalRv({
      batteryType: 'AGM',
      batteryAmpere: '70',
      batteryVolt: '12',
      brakeFrontPadThickness: '11',
    });

    await updateMasterRegisteredVehicle(current, { baseline });

    expect(api.vehicleIntelligence.updateBatterySpec).toHaveBeenCalledWith(
      'rv-1',
      'bat-existing',
      expect.any(Object),
    );
    expect(api.vehicleIntelligence.updateBrakeSpec).toHaveBeenCalledWith(
      'rv-1',
      'brk-existing',
      expect.objectContaining({ frontPadThickness: 11 }),
    );
    expect(api.vehicleIntelligence.createBatterySpec).not.toHaveBeenCalled();
    expect(api.vehicleIntelligence.createBrakeSpec).not.toHaveBeenCalled();
  });

  it('updateMasterRegisteredVehicle skips vehicle PATCH when only motor power form field changes', async () => {
    const baseline = minimalRv({ systemMotorPowerKw: '250' });
    const current = minimalRv({ systemMotorPowerKw: '300' });

    await updateMasterRegisteredVehicle(current, { baseline });

    expect(updateMock).not.toHaveBeenCalled();
    expect(upsertTiresMock).not.toHaveBeenCalled();
  });

  it('persistMasterRegisteredVehicle surfaces tire enrichment partial success from register-from-dimo', async () => {
    registerFromDimoMock.mockResolvedValueOnce({
      vehicle: { id: 'veh-dimo-2' },
      postActivationEnrichment: {
        tireTread: { status: 'FAILED', message: 'tire service unavailable' },
      },
    });

    const result = await persistMasterRegisteredVehicle(minimalRv(), {
      dimoVehicleId: 'dimo-xyz',
    });

    expect(result.vehicleId).toBe('veh-dimo-2');
    expect(result.postActivationEnrichment?.tireTread?.status).toBe('FAILED');
    expect(result.postActivationEnrichment?.tireTread?.message).toContain('unavailable');
  });
});
