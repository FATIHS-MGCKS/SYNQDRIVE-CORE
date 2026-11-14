import { ForbiddenException, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FuelType,
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  ProductSlug,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import {
  CORE_APP_M2M_AUDIENCE,
  CORE_APP_M2M_ISSUER,
  CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ,
  CORE_APP_M2M_SCOPE_VEHICLE_READ,
  CORE_APP_SERVICE_TOKEN_TYPE,
} from '@modules/core-app-m2m/core-app-m2m.constants';
import { CoreAppM2mClientService } from '@modules/core-app-m2m/core-app-m2m-client.service';
import { CoreAppM2mRedisRateLimitService } from '@modules/core-app-m2m/core-app-m2m-redis-rate-limit.service';
import { CoreAppM2mTokenService } from '@modules/core-app-m2m/core-app-m2m-token.service';
import { ProductVehicleAccessService } from '@modules/products/product-vehicle-access/product-vehicle-access.service';
import { AuthGuard } from '@shared/auth/auth.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { CORE_VEHICLE_IDENTITY_V1_SELECT } from '@modules/core-vehicle-read/core-vehicle-read.v1.service';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from '@modules/core-vehicle-read/core-vehicle-read.v1.types';
import { CoreAppVehicleReadAuthGuard } from './core-app-vehicle-read-auth.guard';
import { CoreAppVehicleReadV1Controller } from './core-app-vehicle-read.v1.controller';
import { CoreAppVehicleReadV1Service } from './core-app-vehicle-read.v1.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_1 = 'veh-1';

const ALLOWED_VEHICLE_DTO_KEYS = [
  'version',
  'vehicleId',
  'make',
  'model',
  'year',
  'fuelType',
  'registryLifecycle',
];

describe('CoreAppVehicleReadV1Controller — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p11b-app-vehicle-read-user-jwt-secret';
  const m2mSecret = 'p11b-app-vehicle-read-m2m-signing-secret-at-least-32-chars';

  const activeRentalOrgProduct = {
    id: 'op-rental',
    status: OrgProductStatus.ACTIVE,
    vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    product: { slug: ProductSlug.RENTAL },
  };

  const vehicleRow = {
    id: VEH_1,
    organizationId: ORG_A,
    make: 'VW',
    model: 'Golf',
    year: 2022,
    fuelType: FuelType.GASOLINE,
    registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    vin: 'SECRET-VIN',
    assignedBookingId: 'secret-booking',
  };

  const prisma = {
    organizationProduct: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        const orgId = (args.where as { organizationId: string }).organizationId;
        if (orgId !== ORG_A) return null;
        const slug = (args.where as { product: { slug: string } }).product?.slug;
        if (args.where.status && args.where.status !== OrgProductStatus.ACTIVE) return null;
        if (slug === ProductSlug.RENTAL) return activeRentalOrgProduct;
        if (slug === ProductSlug.FLEET) {
          return {
            ...activeRentalOrgProduct,
            id: 'op-fleet',
            product: { slug: ProductSlug.FLEET },
          };
        }
        return null;
      }),
    },
    vehicle: {
      count: jest.fn(async () => 1),
      findMany: jest.fn(async (args: { select?: Record<string, boolean> }) => {
        const keys = args.select ? Object.keys(args.select) : [];
        const row: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in vehicleRow) row[k] = (vehicleRow as Record<string, unknown>)[k];
        }
        return [row];
      }),
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        const where = args.where;
        if (where.vehicleProductGrants) {
          return null;
        }
        if (where.id === VEH_1 && where.organizationId === ORG_A) {
          return {
            id: vehicleRow.id,
            make: vehicleRow.make,
            model: vehicleRow.model,
            year: vehicleRow.year,
            fuelType: vehicleRow.fuelType,
            registryLifecycle: vehicleRow.registryLifecycle,
          };
        }
        return null;
      }),
    },
  };

  const clients = {
    loadClientGrantForVerification: jest.fn(),
    assertM2mAuthorizationLive: jest.fn(),
  };

  function listRoute(orgId: string, product: string) {
    return `/api/v1/core/app/read/v1/organizations/${orgId}/products/${product}/vehicles`;
  }

  function detailRoute(orgId: string, product: string, vehicleId: string) {
    return `${listRoute(orgId, product)}/${vehicleId}`;
  }

  function signVehicleM2mToken(input: {
    orgId: string;
    product: ProductSlug;
    scope: string;
    clientProduct?: ProductSlug;
    expOffsetSec?: number;
    org?: string;
    gv?: number;
  }) {
    const product = input.clientProduct ?? input.product;
    return jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: input.org ?? input.orgId,
        product,
        scopes: [input.scope],
        cid: 'client-db-rental',
        cv: 1,
        gv: input.gv ?? 1,
        jti: 'jti-p11b',
      },
      m2mSecret,
      {
        algorithm: 'HS256',
        issuer: CORE_APP_M2M_ISSUER,
        audience: CORE_APP_M2M_AUDIENCE,
        subject: 'rental-app-client',
        expiresIn: input.expOffsetSec ?? 120,
      },
    );
  }

  function bearerM2m(token: string) {
    return `Bearer ${token}`;
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
        id: 'client-db-rental',
        clientId: 'rental-app-client',
        productSlug: ProductSlug.RENTAL,
        credentialVersion: 1,
        status: 'ACTIVE',
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ, CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      },
      grant: { organizationId: ORG_A, grantVersion: 1, status: 'ACTIVE' },
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
        {
          provide: CoreAppM2mRedisRateLimitService,
          useValue: { assertVehicleReadAllowed: jest.fn().mockResolvedValue(undefined) },
        },
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
    jest.clearAllMocks();
    clients.loadClientGrantForVerification.mockResolvedValue({
      client: {
        id: 'client-db-rental',
        clientId: 'rental-app-client',
        productSlug: ProductSlug.RENTAL,
        credentialVersion: 1,
        status: 'ACTIVE',
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ, CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      },
      grant: { organizationId: ORG_A, grantVersion: 1, status: 'ACTIVE' },
    });
  });

  it('allows product-bound M2M principal with vehicle read scope', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    const res = await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(200);

    expect(res.body.version).toBe(CORE_VEHICLE_READ_CONTRACT_VERSION);
    expect(res.body.productSlug).toBe(ProductSlug.RENTAL);
    expect(res.body.vehicles).toHaveLength(1);
    expect(Object.keys(res.body.vehicles[0]).sort()).toEqual(ALLOWED_VEHICLE_DTO_KEYS.sort());
    expect(prisma.vehicle.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }),
    );
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: CORE_VEHICLE_IDENTITY_V1_SELECT }),
    );
  });

  it('SELECTED_VEHICLES with zero grants returns empty list and total 0', async () => {
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'op-rental',
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      product: { slug: ProductSlug.RENTAL },
    });
    prisma.vehicle.count.mockResolvedValueOnce(0);
    prisma.vehicle.findMany.mockResolvedValueOnce([]);
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    const res = await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(200);

    expect(res.body.vehicles).toEqual([]);
    expect(res.body.pagination).toMatchObject({ total: 0, page: 1 });
    const countWhere = (prisma.vehicle.count as jest.Mock).mock.calls.at(-1)?.[0]?.where;
    const findWhere = (prisma.vehicle.findMany as jest.Mock).mock.calls.at(-1)?.[0]?.where;
    expect(countWhere).toEqual(findWhere);
    expect(countWhere).toHaveProperty('vehicleProductGrants');
  });

  it('denies different product in URL (403)', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.FLEET))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('denies entitlements-only scope on vehicle read route', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('denies user JWT', async () => {
    const userToken = jwt.sign(
      { sub: 'user-1', email: 'u@test', organizationId: ORG_A },
      jwtSecret,
      { expiresIn: '1h' },
    );
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('denies expired service token', async () => {
    const token = jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: ORG_A,
        product: ProductSlug.RENTAL,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        cid: 'client-db-rental',
        cv: 1,
        gv: 1,
        jti: 'jti-expired',
      },
      m2mSecret,
      {
        algorithm: 'HS256',
        issuer: CORE_APP_M2M_ISSUER,
        audience: CORE_APP_M2M_AUDIENCE,
        subject: 'rental-app-client',
        expiresIn: -60,
      },
    );
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('denies wrong organization', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_B, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('denies when organization grant verification fails', async () => {
    clients.loadClientGrantForVerification.mockRejectedValueOnce(
      new ForbiddenException('Organization grant is not active'),
    );
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('denies inactive product license', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValueOnce(null);
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, ProductSlug.RENTAL))
      .set('Authorization', bearerM2m(token))
      .expect(403);
  });

  it('returns 404 for unauthorized vehicle detail', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(detailRoute(ORG_A, ProductSlug.RENTAL, 'veh-missing'))
      .set('Authorization', bearerM2m(token))
      .expect(404);
  });

  it('rejects invalid ProductSlug in path', async () => {
    const token = signVehicleM2mToken({
      orgId: ORG_A,
      product: ProductSlug.RENTAL,
      scope: CORE_APP_M2M_SCOPE_VEHICLE_READ,
    });
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, 'NOT_A_PRODUCT'))
      .set('Authorization', bearerM2m(token))
      .expect(400);
  });
});

describe('Core App vehicle read — module exposure gate', () => {
  let app: INestApplication;
  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'p11b-flag-off-jwt-secret-value',
      CORE_APP_M2M_ENABLED: 'false',
      CORE_APP_VEHICLE_READ_V1_ENABLED: 'false',
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  it('returns 404 when module not registered (flags off)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/core/app/read/v1/organizations/org-a/products/RENTAL/vehicles`)
      .expect(404);
  });
});