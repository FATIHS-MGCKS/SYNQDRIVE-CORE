import { HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProductSlug } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import {
  CORE_APP_M2M_AUDIENCE,
  CORE_APP_M2M_ISSUER,
  CORE_APP_M2M_SCOPE_VEHICLE_READ,
  CORE_APP_SERVICE_TOKEN_TYPE,
} from '@modules/core-app-m2m/core-app-m2m.constants';
import { CoreAppM2mClientService } from '@modules/core-app-m2m/core-app-m2m-client.service';
import { CoreAppM2mRedisRateLimitService } from '@modules/core-app-m2m/core-app-m2m-redis-rate-limit.service';
import { CoreAppM2mTokenService } from '@modules/core-app-m2m/core-app-m2m-token.service';
import { ProductVehicleAccessService } from '@modules/products/product-vehicle-access/product-vehicle-access.service';
import { AuthGuard } from '@shared/auth/auth.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreAppVehicleReadAuthGuard } from './core-app-vehicle-read-auth.guard';
import { CoreAppVehicleReadV1Controller } from './core-app-vehicle-read.v1.controller';
import { CoreAppVehicleReadV1Service } from './core-app-vehicle-read.v1.service';

const ORG = 'org-rate-limit';

describe('CoreApp vehicle read — distributed rate limit HTTP', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const m2mSecret = 'p11c-rate-limit-m2m-signing-secret-at-least-32-characters';
  const jwtSecret = 'p11c-rate-limit-user-jwt-secret';

  const rateLimit = { assertVehicleReadAllowed: jest.fn() };
  const clients = {
    loadClientGrantForVerification: jest.fn(),
    assertM2mAuthorizationLive: jest.fn(),
  };

  const prisma = {
    organizationProduct: {
      findFirst: jest.fn(async () => ({
        id: 'op',
        status: 'ACTIVE',
        vehicleAccessMode: 'ORGANIZATION_WIDE',
        product: { slug: ProductSlug.RENTAL },
      })),
    },
    vehicle: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
  };

  function signToken() {
    return jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: ORG,
        product: ProductSlug.RENTAL,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        cid: 'db-id',
        cv: 1,
        gv: 1,
        jti: 'jti',
      },
      m2mSecret,
      {
        algorithm: 'HS256',
        issuer: CORE_APP_M2M_ISSUER,
        audience: CORE_APP_M2M_AUDIENCE,
        subject: 'rental-app-client',
        expiresIn: 120,
      },
    );
  }

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: jwtSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
      CORE_APP_VEHICLE_READ_V1_ENABLED: 'true',
    };
    clients.loadClientGrantForVerification.mockResolvedValue({
      client: {
        id: 'db-id',
        clientId: 'rental-app-client',
        productSlug: ProductSlug.RENTAL,
        credentialVersion: 1,
        status: 'ACTIVE',
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      },
      grant: { organizationId: ORG, grantVersion: 1, status: 'ACTIVE' },
    });
    clients.assertM2mAuthorizationLive.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [CoreAppVehicleReadV1Controller],
      providers: [
        CoreAppVehicleReadV1Service,
        ProductVehicleAccessService,
        CoreAppVehicleReadAuthGuard,
        CoreAppM2mTokenService,
        { provide: CoreAppM2mClientService, useValue: clients },
        { provide: CoreAppM2mRedisRateLimitService, useValue: rateLimit },
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

  beforeEach(() => {
    rateLimit.assertVehicleReadAllowed.mockReset();
    rateLimit.assertVehicleReadAllowed.mockResolvedValue(undefined);
  });

  it('returns 429 when vehicle read rate limit is exceeded', async () => {
    rateLimit.assertVehicleReadAllowed.mockRejectedValue(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
    );
    const res = await request(app.getHttpServer())
      .get(`/api/v1/core/app/read/v1/organizations/${ORG}/products/rental/vehicles`)
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(429);
  });

  it('returns 503 when Redis rate limiter is unavailable', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common');
    rateLimit.assertVehicleReadAllowed.mockRejectedValue(
      new ServiceUnavailableException('Rate limit service unavailable'),
    );
    const res = await request(app.getHttpServer())
      .get(`/api/v1/core/app/read/v1/organizations/${ORG}/products/rental/vehicles`)
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(503);
  });
});