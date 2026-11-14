import { VehicleRegistryLifecycle } from '@prisma/client';

/** Lifecycle states eligible for product vehicle access (aligned with VehicleProductGrantService). */
export const PRODUCT_VEHICLE_ACCESS_ELIGIBLE_LIFECYCLES: VehicleRegistryLifecycle[] = [
  VehicleRegistryLifecycle.ACTIVE,
];