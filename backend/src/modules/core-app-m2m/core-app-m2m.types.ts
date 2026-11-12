import type { ProductSlug } from '@prisma/client';
import type { CoreAppM2mAllowedScope } from './core-app-m2m.constants';

export type CoreAppServicePrincipal = {
  kind: 'core_app_service';
  clientDbId: string;
  clientId: string;
  organizationId: string;
  productSlug: ProductSlug;
  scopes: CoreAppM2mAllowedScope[];
  credentialVersion: number;
  grantVersion: number;
  jti: string;
};

export type CoreAppServiceTokenClaims = {
  typ: 'core_app_service';
  iss: string;
  aud: string;
  sub: string;
  org: string;
  product: ProductSlug;
  scopes: string[];
  cid: string;
  cv: number;
  gv: number;
  jti: string;
  iat: number;
  exp: number;
};
