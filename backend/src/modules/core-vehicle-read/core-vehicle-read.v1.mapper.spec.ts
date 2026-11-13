import { FuelType, VehicleRegistryLifecycle } from '@prisma/client';
import { toCoreVehicleIdentityV1 } from './core-vehicle-read.v1.mapper';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from './core-vehicle-read.v1.types';

describe('toCoreVehicleIdentityV1', () => {
  it('maps only explicit identity fields', () => {
    const dto = toCoreVehicleIdentityV1({
      id: 'veh-1',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      fuelType: FuelType.DIESEL,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });

    expect(dto).toEqual({
      version: CORE_VEHICLE_READ_CONTRACT_VERSION,
      vehicleId: 'veh-1',
      make: 'VW',
      model: 'Golf',
      year: 2022,
      fuelType: FuelType.DIESEL,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });
    expect(Object.keys(dto).sort()).toEqual(
      [
        'fuelType',
        'make',
        'model',
        'registryLifecycle',
        'vehicleId',
        'version',
        'year',
      ].sort(),
    );
  });
});
