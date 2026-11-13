import { BadRequestException } from '@nestjs/common';

export const CORE_VEHICLE_READ_DEFAULT_PAGE = 1;
export const CORE_VEHICLE_READ_DEFAULT_LIMIT = 20;
export const CORE_VEHICLE_READ_MAX_LIMIT = 100;
/** Prisma `skip` / `take` use signed 32-bit integers. */
export const PRISMA_SKIP_TAKE_INT32_MAX = 2_147_483_647;

export type CoreVehicleReadPagination = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

function parsePositiveIntQueryParam(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException(`Invalid ${name}: must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException(`Invalid ${name}: must be a positive integer`);
  }
  return value;
}

function assertPrismaPaginationOffset(skip: number, take: number): void {
  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new BadRequestException('Invalid page: pagination offset is out of range');
  }
  if (!Number.isSafeInteger(take) || take < 1) {
    throw new BadRequestException('Invalid limit: pagination take is out of range');
  }
  if (skip > PRISMA_SKIP_TAKE_INT32_MAX || take > PRISMA_SKIP_TAKE_INT32_MAX) {
    throw new BadRequestException('Invalid pagination: offset exceeds supported range');
  }
}

export function parseCoreVehicleReadPagination(
  pageRaw?: string,
  limitRaw?: string,
): CoreVehicleReadPagination {
  const page = parsePositiveIntQueryParam('page', pageRaw, CORE_VEHICLE_READ_DEFAULT_PAGE);
  const limit = parsePositiveIntQueryParam('limit', limitRaw, CORE_VEHICLE_READ_DEFAULT_LIMIT);
  if (limit > CORE_VEHICLE_READ_MAX_LIMIT) {
    throw new BadRequestException(`Invalid limit: must be at most ${CORE_VEHICLE_READ_MAX_LIMIT}`);
  }
  const skip = (page - 1) * limit;
  assertPrismaPaginationOffset(skip, limit);
  return {
    page,
    limit,
    skip,
    take: limit,
  };
}

export function coreVehicleReadPaginationMeta(
  total: number,
  pagination: CoreVehicleReadPagination,
): {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  return {
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
