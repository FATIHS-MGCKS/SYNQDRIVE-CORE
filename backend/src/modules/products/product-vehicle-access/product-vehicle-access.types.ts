import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type ResolvedProductVehicleAccess = {
  organizationId: string;
  productSlug: ProductSlug;
  organizationProductId: string;
  vehicleAccessMode: OrganizationProductVehicleAccessMode;
  licenseStatus: OrgProductStatus;
};

export type AuthorizedVehicleWhereInput = Prisma.VehicleWhereInput;