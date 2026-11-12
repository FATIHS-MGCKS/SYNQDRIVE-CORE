import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrgProductStatus, ProductSlug } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CoreAppEntitlementsAuthGuard } from '@modules/core-app-m2m/core-app-entitlements-auth.guard';
import { CoreAppM2mTokenService } from '@modules/core-app-m2m/core-app-m2m-token.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreEntitlementsReadController } from './core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements-query.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_MEMBER = 'user-member';
const USER_FOREIGN = 'user-foreign';
const USER_SUSPENDED = 'user-suspended';
const MASTER_ADMIN = 'master-admin';

const MEMBERSHIPS: Record<string, { id: string; role: string } | null> = {
  [`${USER_MEMBER}|${ORG_A}`]: { id: 'mem-1', role: 'WORKER' },
  [`${USER_FOREIGN}|${ORG_A}`]: null,
  [`${USER_FOREIGN}|${ORG_B}`]: { id: 'mem-2', role: 'WORKER' },
  [`${USER_SUSPENDED}|${ORG_A}`]: null,
};

describe('CoreEntitlementsReadController — HTTP security integration', () => {
  let app: INestApplication;
  const originalSecret = process.env.JWT_SECRET;
  const jwtSecret = 'p1a-entitlements-http-security-test-secret';

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B ? { id: args.where.id } : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
          const key = `${args.where.userId}|${args.where.organizationId}`;
          const row = MEMBERSHIPS[key];
          if (!row) return null;
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          return row;
        },
      ),
    },
    organizationProduct: {
      findMany: jest.fn(async () => [
        {
          productId: 'prod-rental',
          status: OrgProductStatus.ACTIVE,
          plan: 'STARTER',
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          product: { id: 'prod-rental', slug: ProductSlug.RENTAL, name: 'Rental' },
        },
      ]),
      findFirst: jest.fn(async (args: { where: { organizationId: string; product: { slug: string } } }) => {
        if (args.where.product.slug === ProductSlug.RENTAL) {
          return {
            productId: 'prod-rental',
            status: OrgProductStatus.ACTIVE,
            plan: 'STARTER',
            activatedAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
            product: { id: 'prod-rental', slug: ProductSlug.RENTAL, name: 'Rental' },
          };
        }
        return null;
      }),
    },
  };

  function signToken(claims: Record<string, unknown>): string {
    return jwt.sign(
      {
        sub: claims.id,
        email: `${claims.id}@test.local`,
        name: String(claims.id),
        platformRole: claims.platformRole ?? 'USER',
        membershipRole: claims.membershipRole ?? 'WORKER',
        organizationId: claims.organizationId,
      },
      jwtSecret,
      { expiresIn: '1h' },
    );
  }

  function bearer(claims: Record<string, unknown>): string {
    return `Bearer ${signToken(claims)}`;
  }

  const routeList = `/api/v1/core/entitlements/v1/organizations/${ORG_A}`;
  const routeSingle = `/api/v1/core/entitlements/v1/organizations/${ORG_A}/products/RENTAL`;
  const routeInvalidSlug = `/api/v1/core/entitlements/v1/organizations/${ORG_A}/products/VYMOD`;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreEntitlementsReadController],
      providers: [
        EntitlementsQueryService,
        CoreAppEntitlementsAuthGuard,
        OrgScopingGuard,
        { provide: CoreAppM2mTokenService, useValue: { verifyBearerToken: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    process.env.JWT_SECRET = originalSecret;
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies request without JWT (global AuthGuard)', async () => {
    await request(app.getHttpServer()).get(routeList).expect(401);
  });

  it('allows member JWT for own organization list', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.organizationId).toBe(ORG_A);
        expect(res.body.products).toHaveLength(1);
      });
  });

  it('allows member JWT for own organization single product', async () => {
    await request(app.getHttpServer())
      .get(routeSingle)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200)
      .expect((res) => {
        expect(res.body.productSlug).toBe(ProductSlug.RENTAL);
        expect(res.body.entitled).toBe(true);
      });
  });

  it('denies JWT holder for foreign organization (OrgScopingGuard)', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_FOREIGN, organizationId: ORG_B }))
      .expect(403);
  });

  it('denies user without active membership in target org', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set('Authorization', bearer({ id: USER_SUSPENDED, organizationId: ORG_A }))
      .expect(403);
  });

  it('allows MASTER_ADMIN cross-org per OrgScopingGuard pass-through', async () => {
    await request(app.getHttpServer())
      .get(routeList)
      .set(
        'Authorization',
        bearer({
          id: MASTER_ADMIN,
          platformRole: 'MASTER_ADMIN',
          organizationId: ORG_B,
        }),
      )
      .expect(200);
  });

  it('returns 404 for invalid product slug', async () => {
    await request(app.getHttpServer())
      .get(routeInvalidSlug)
      .set('Authorization', bearer({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });
});
