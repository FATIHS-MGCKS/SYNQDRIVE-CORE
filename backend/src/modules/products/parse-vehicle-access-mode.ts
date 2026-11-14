import { BadRequestException } from '@nestjs/common';
import { OrganizationProductVehicleAccessMode } from '@prisma/client';

const ALLOWED = new Set<string>(Object.values(OrganizationProductVehicleAccessMode));

export function parseVehicleAccessModeParam(
  value: unknown,
  label = 'vehicleAccessMode',
): OrganizationProductVehicleAccessMode {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!raw || !ALLOWED.has(raw)) {
    throw new BadRequestException(`${label} is invalid or missing`);
  }
  return raw as OrganizationProductVehicleAccessMode;
}