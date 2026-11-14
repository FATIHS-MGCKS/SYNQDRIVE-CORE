import { ProductSlug } from '@prisma/client';

/**
 * Server-authoritative product access mode (not client-selectable).
 *
 * ORGANIZATION_WIDE — entitled org users may access eligible fleet under org + user auth;
 *   explicit per-vehicle grants optional but not required for B2B reads.
 * EXPLICIT_VEHICLE — consumer/app access requires an active VehicleProductGrant per vehicle
 *   (enforcement is deferred until app-facing read contracts / M2M gates).
 */
export const ProductAccessMode = {
  ORGANIZATION_WIDE: 'ORGANIZATION_WIDE',
  EXPLICIT_VEHICLE: 'EXPLICIT_VEHICLE',
} as const;

export type ProductAccessModeCode = (typeof ProductAccessMode)[keyof typeof ProductAccessMode];

/** Authoritative map until per-product DB configuration exists (no VYMOD slug yet). */
export const PRODUCT_ACCESS_MODE_BY_SLUG: Record<ProductSlug, ProductAccessModeCode> = {
  [ProductSlug.RENTAL]: ProductAccessMode.ORGANIZATION_WIDE,
  [ProductSlug.FLEET]: ProductAccessMode.ORGANIZATION_WIDE,
  [ProductSlug.TAXI]: ProductAccessMode.ORGANIZATION_WIDE,
};

export function resolveProductAccessMode(productSlug: ProductSlug): ProductAccessModeCode {
  return PRODUCT_ACCESS_MODE_BY_SLUG[productSlug];
}