import type { FuelType, VehicleRegistryLifecycle } from '@prisma/client';
import {
  CORE_VEHICLE_READ_CONTRACT_VERSION,
  type CoreVehicleIdentityV1,
} from './core-vehicle-read.v1.types';

type VehicleIdentityRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  registryLifecycle: VehicleRegistryLifecycle;
};

export function toCoreVehicleIdentityV1(row: VehicleIdentityRow): CoreVehicleIdentityV1 {
  return {
    version: CORE_VEHICLE_READ_CONTRACT_VERSION,
    vehicleId: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    fuelType: row.fuelType,
    registryLifecycle: row.registryLifecycle,
  };
}
