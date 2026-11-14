import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { parseProductSlugParam } from './parse-product-slug';

describe('parseProductSlugParam', () => {
  it('accepts valid slugs case-insensitively', () => {
    expect(parseProductSlugParam('rental')).toBe(ProductSlug.RENTAL);
  });

  it('rejects missing slug', () => {
    expect(() => parseProductSlugParam(undefined)).toThrow(BadRequestException);
  });

  it('rejects unknown slug', () => {
    expect(() => parseProductSlugParam('VYMOD')).toThrow(BadRequestException);
  });
});