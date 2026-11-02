import type { Prisma } from '@prisma/client';
import type {
  VehicleRegistryLifecycleFilter,
  VehiclesOperationalQueryDto,
} from './vehicles-operational.types';

/** Default list filter — matches Connected Vehicles UI (`cv.utils`). */
export const DEFAULT_REGISTERED_REGISTRY_LIFECYCLE: Exclude<
  VehicleRegistryLifecycleFilter,
  'all'
> = 'ACTIVE';

export function resolveRegistryLifecycleFilter(
  query: Pick<VehiclesOperationalQueryDto, 'registryLifecycle'>,
): VehicleRegistryLifecycleFilter {
  return query.registryLifecycle ?? DEFAULT_REGISTERED_REGISTRY_LIFECYCLE;
}

export function buildRegisteredOperationalWhere(
  query: VehiclesOperationalQueryDto,
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {};
  const lifecycle = resolveRegistryLifecycleFilter(query);
  if (lifecycle !== 'all') {
    where.registryLifecycle = lifecycle;
  }
  if (query.organizationId) {
    where.organizationId = query.organizationId;
  }
  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { vin: { contains: q, mode: 'insensitive' } },
      { licensePlate: { contains: q, mode: 'insensitive' } },
      { vehicleName: { contains: q, mode: 'insensitive' } },
      { make: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { organization: { companyName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export function buildRegisteredListQueryForOverviewSampling(
  organizationId?: string,
): VehiclesOperationalQueryDto {
  return {
    page: 1,
    limit: 500,
    registrationState: 'registered',
    registryLifecycle: DEFAULT_REGISTERED_REGISTRY_LIFECYCLE,
    ...(organizationId?.trim() ? { organizationId: organizationId.trim() } : {}),
  };
}
