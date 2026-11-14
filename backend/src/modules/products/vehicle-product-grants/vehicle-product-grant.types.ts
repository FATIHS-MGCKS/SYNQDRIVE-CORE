import type { ProductSlug, VehicleProductGrantStatus } from '@prisma/client';

export type VehicleProductGrantRecord = {
  id: string;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  status: VehicleProductGrantStatus;
  grantVersion: number;
  grantedAt: Date;
  revokedAt: Date | null;
  grantedByUserId: string;
  revokedByUserId: string | null;
};

export type VehicleProductGrantListItem = Pick<
  VehicleProductGrantRecord,
  'vehicleId' | 'productSlug' | 'status' | 'grantVersion' | 'grantedAt' | 'revokedAt'
>;