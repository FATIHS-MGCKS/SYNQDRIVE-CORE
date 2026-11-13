import { BadRequestException } from '@nestjs/common';

export const CORE_VEHICLE_READ_DEFAULT_PAGE = 1;
export const CORE_VEHICLE_READ_DEFAULT_LIMIT = 20;
export const CORE_VEHICLE_READ_MAX_LIMIT = 100;

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

export function parseCoreVehicleReadPagination(
  pageRaw?: string,
  limitRaw?: string,
): CoreVehicleReadPagination {
  const page = parsePositiveIntQueryParam('page', pageRaw, CORE_VEHICLE_READ_DEFAULT_PAGE);
  const limit = parsePositiveIntQueryParam('limit', limitRaw, CORE_VEHICLE_READ_DEFAULT_LIMIT);
  if (limit > CORE_VEHICLE_READ_MAX_LIMIT) {
    throw new BadRequestException(`Invalid limit: must be at most ${CORE_VEHICLE_READ_MAX_LIMIT}`);
  }
  return {
    page,
    limit,
    skip: (page - 1) * limit,
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
