import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreEntitlementsReadController } from '@modules/products/entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from '@modules/products/entitlements/entitlements-query.service';
import { CoreAppEntitlementsAuthGuard } from './core-app-entitlements-auth.guard';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import {
  CORE_APP_M2M_AUDIENCE,
  CORE_APP_M2M_ISSUER,
  CORE_APP_SERVICE_TOKEN_TYPE,
} from './core-app-m2m.constants';

@Controller('admin/products')
class DummyAdminSurfaceController {
  @Get()
  list() {
    return [];
  }
}

const ORG_A = '11111111-1111-1111-1111-111111111111';
const CLIENT_DB_ID = 'client-db-1';

describe('Core app M2M — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const m2mSecret = 'integration-m2m-signing-secret';
  const userSecret = 'integration-user-jwt-secret';
  let clientSecret = 'test-client-secret-plain';

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A ? { id: ORG_A } : null,
      ),
    },
    organizationMembership: { findFirst: jest.fn() },
    organizationProduct: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({
        productId: 'p1',
        status: OrgProductStatus.ACTIVE,
        plan: 'STARTER',
        activatedAt: new Date(),
        expiresAt: null,
        product: { id: 'p1', slug: ProductSlug.RENTAL, name: 'Rental' },
      })),
    },
    coreAppServiceClient: {
      findUnique: jest.fn(),
    },
    coreAppServiceOrgGrant: {
      findUnique: jest.fn(),
    },
  };

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: userSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
    };
    clientSecret = 'test-client-secret-plain';
    const hash = await bcrypt.hash(clientSecret, 4);

    prisma.coreAppServiceClient.findUnique.mockImplementation(async (args: { where: { id?: string } }) => {
      if (args.where.id === CLIENT_DB_ID) {
        return {
          id: CLIENT_DB_ID,
          clientId: 'rental-test',
          productSlug: ProductSlug.RENTAL,
          credentialVersion: 1,
          status: CoreAppServiceClientStatus.ACTIVE,
          credentialHash: hash,
          allowedScopes: ['core:entitlements:read'],
        };
      }
      return null;
    });

    prisma.coreAppServiceOrgGrant.findUnique.mockImplementation(async () => ({
      organizationId: ORG_A,
      grantVersion: 1,
      status: CoreAppServiceGrantStatus.ACTIVE,
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [CoreEntitlementsReadController, DummyAdminSurfaceController],
      providers: [
        EntitlementsQueryService,
        CoreAppM2mClientService,
        CoreAppM2mTokenService,
        CoreAppEntitlementsAuthGuard,
        OrgScopingGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  function serviceToken(orgId: string, overrides: Record<string, unknown> = {}) {
    return jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: orgId,
        product: ProductSlug.RENTAL,
        scopes: ['core:entitlements:read'],
        cid: CLIENT_DB_ID,
        cv: 1,
        gv: 1,
        jti: 'jti-test-1',
        ...overrides,
      },
      m2mSecret,
      {
        algorithm: 'HS256',
        issuer: CORE_APP_M2M_ISSUER,
        audience: CORE_APP_M2M_AUDIENCE,
        subject: 'rental-test',
        expiresIn: 120,
      },
    );
  }

  it('allows valid service token on own organization entitlements', async () => {
    const token = serviceToken(ORG_A);
    await request(app.getHttpServer())
      .get(`/api/v1/core/entitlements/v1/organizations/${ORG_A}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('denies service token for foreign organization route', async () => {
    const token = serviceToken(ORG_A);
    const foreign = '22222222-2222-2222-2222-222222222222';
    await request(app.getHttpServer())
      .get(`/api/v1/core/entitlements/v1/organizations/${foreign}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects service token on admin route', async () => {
    const token = serviceToken(ORG_A);
    await request(app.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects service token when grant version does not match', async () => {
    prisma.coreAppServiceOrgGrant.findUnique.mockResolvedValueOnce({
      organizationId: ORG_A,
      grantVersion: 99,
      status: CoreAppServiceGrantStatus.ACTIVE,
    });
    const token = serviceToken(ORG_A, { gv: 1 });
    await request(app.getHttpServer())
      .get(`/api/v1/core/entitlements/v1/organizations/${ORG_A}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects service JWT when feature gate disabled', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    const token = serviceToken(ORG_A);
    await request(app.getHttpServer())
      .get(`/api/v1/core/entitlements/v1/organizations/${ORG_A}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    process.env.CORE_APP_M2M_ENABLED = 'true';
  });
});
