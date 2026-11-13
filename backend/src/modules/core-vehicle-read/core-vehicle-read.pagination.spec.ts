import { BadRequestException } from '@nestjs/common';
import {
  CORE_VEHICLE_READ_DEFAULT_LIMIT,
  CORE_VEHICLE_READ_DEFAULT_PAGE,
  CORE_VEHICLE_READ_MAX_LIMIT,
  PRISMA_SKIP_TAKE_INT32_MAX,
  parseCoreVehicleReadPagination,
} from './core-vehicle-read.pagination';

describe('parseCoreVehicleReadPagination', () => {
  it('uses defaults when page and limit are omitted', () => {
    expect(parseCoreVehicleReadPagination()).toEqual({
      page: CORE_VEHICLE_READ_DEFAULT_PAGE,
      limit: CORE_VEHICLE_READ_DEFAULT_LIMIT,
      skip: 0,
      take: CORE_VEHICLE_READ_DEFAULT_LIMIT,
    });
  });

  it('accepts valid page and limit', () => {
    expect(parseCoreVehicleReadPagination('2', '50')).toEqual({
      page: 2,
      limit: 50,
      skip: 50,
      take: 50,
    });
  });

  it('rejects non-integer page', () => {
    expect(() => parseCoreVehicleReadPagination('abc')).toThrow(BadRequestException);
    expect(() => parseCoreVehicleReadPagination('1.5')).toThrow(BadRequestException);
  });

  it('rejects non-positive limit', () => {
    expect(() => parseCoreVehicleReadPagination('1', '-1')).toThrow(BadRequestException);
    expect(() => parseCoreVehicleReadPagination('1', '0')).toThrow(BadRequestException);
  });

  it('rejects limit above maximum', () => {
    expect(() => parseCoreVehicleReadPagination('1', String(CORE_VEHICLE_READ_MAX_LIMIT + 1))).toThrow(
      BadRequestException,
    );
  });

  it('rejects unsafe-integer skip from huge page', () => {
    expect(() => parseCoreVehicleReadPagination('9007199254740991', '100')).toThrow(BadRequestException);
  });

  it('accepts max in-range skip at Int32 boundary', () => {
    const limit = 100;
    const maxPage = Math.floor(PRISMA_SKIP_TAKE_INT32_MAX / limit) + 1;
    const pagination = parseCoreVehicleReadPagination(String(maxPage), String(limit));
    expect(pagination.skip).toBeLessThanOrEqual(PRISMA_SKIP_TAKE_INT32_MAX);
    expect(Number.isSafeInteger(pagination.skip)).toBe(true);
  });

  it('rejects skip above Prisma Int32 max', () => {
    const limit = 100;
    const pageBeyond = Math.floor(PRISMA_SKIP_TAKE_INT32_MAX / limit) + 2;
    expect(() => parseCoreVehicleReadPagination(String(pageBeyond), String(limit))).toThrow(
      BadRequestException,
    );
  });
});
