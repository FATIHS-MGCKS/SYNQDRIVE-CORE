import type { FuelType, ProductSlug, VehicleRegistryLifecycle } from '@prisma/client';

export const CORE_VEHICLE_READ_CONTRACT_VERSION = 'core.vehicle.read.v1' as const;

/** Explicit allowlist — never return raw Prisma vehicle rows. */
export type CoreVehicleIdentityV1 = {
  version: typeof CORE_VEHICLE_READ_CONTRACT_VERSION;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  registryLifecycle: VehicleRegistryLifecycle;
};

export type CoreVehicleReadListV1 = {
  version: typeof CORE_VEHICLE_READ_CONTRACT_VERSION;
  organizationId: string;
  productSlug: ProductSlug;
  vehicles: CoreVehicleIdentityV1[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type CoreVehicleReadSingleV1 = {
  version: typeof CORE_VEHICLE_READ_CONTRACT_VERSION;
  organizationId: string;
  productSlug: ProductSlug;
  vehicle: CoreVehicleIdentityV1;
};
