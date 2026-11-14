import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';

const ALLOWED_PRODUCT_SLUGS = new Set<string>(Object.values(ProductSlug));

export function parseProductSlugParam(value: unknown, label = 'productSlug'): ProductSlug {
  const slug = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!slug || !ALLOWED_PRODUCT_SLUGS.has(slug)) {
    throw new BadRequestException(`${label} is invalid or missing`);
  }
  return slug as ProductSlug;
}