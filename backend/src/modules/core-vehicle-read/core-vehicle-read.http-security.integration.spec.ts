import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FuelType,
  ProductSlug,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import {
  CORE_APP_M2M_AUDIENCE,
  CORE_APP_M2M_ISSUER,
  CORE_APP_SERVICE_TOKEN_TYPE,
} from '@modules/core-app-m2m/core-app-m2m.constants';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreVehicleReadProductGuard } from './core-vehicle-read.product.guard';
import { CoreVehicleReadV1Controller } from './core-vehicle-read.v1.controller';
import { CORE_VEHICLE_IDENTITY_V1_SELECT, CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';
import { CORE_VEHICLE_READ_CONTRACT_VERSION } from './core-vehicle-read.v1.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_MEMBER = 'user-member';
const USER_FOREIGN = 'user-foreign';
const USER_NO_FLEET = 'user-no-fleet';
const USER_REVOKED_MEMBERSHIP = 'user-revoked-membership';
const VEHICLE_A = {
  id: 'veh-a',
  organizationId: ORG_A,
  make: 'VW',
  model: 'Golf',
  year: 2022,
  fuelType: FuelType.GASOLINE,
  registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
  assignedBookingId: 'booking-secret',
  organization: { name: 'Org A' },
};

const VEHICLE_B = {
  ...VEHICLE_A,
  id: 'veh-b',
  organizationId: ORG_B,
};

type MembershipRow = { role: string; permissions: unknown };

const MEMBERSHIPS: Record<string, MembershipRow | null> = {
  [`${USER_MEMBER}|${ORG_A}`]: {
    role: 'WORKER',
    permissions: { fleet: { read: true, write: false } },
  },
  [`${USER_FOREIGN}|${ORG_A}`]: null,
  [`${USER_FOREIGN}|${ORG_B}`]: { role: 'WORKER', permissions: { fleet: { read: true } } },
  [`${USER_NO_FLEET}|${ORG_A}`]: {
    role: 'WORKER',
    permissions: { fleet: { read: false, write: false } },
  },
  [`${USER_REVOKED_MEMBERSHIP}|${ORG_A}`]: null,
};

function projectPrismaSelect<T extends Record<string, unknown>>(
  full: T,
  select: Record<string, boolean> | undefined,
): Record<string, unknown> {
  if (!select) return { ...full };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key] === true && key in full) {
      out[key] = full[key];
    }
  }
  return out;
}

const ALLOWED_VEHICLE_DTO_KEYS = [
  'version',
  'vehicleId',
  'make',
  'model',
  'year',
  'fuelType',
  'registryLifecycle',
];

describe('CoreVehicleReadV1Controller — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p3-vehicle-read-http-security-secret';
  const m2mSecret = 'p3-vehicle-read-m2m-signing-secret';

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
          return { id: `mem-${key}`, role: row.role, permissions: row.permissions };
        },
      ),
    },
    organizationProduct: {
      findFirst: jest.fn(
        async (args: {
          where: { organizationId: string; product: { slug: string }; status?: string };
        }) => {
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          if (args.where.organizationId !== ORG_A) return null;
          if (args.where.product.slug === ProductSlug.RENTAL) {
            return { id: 'op-rental', product: { slug: ProductSlug.RENTAL } };
          }
          return null;
        },
      ),
    },
    vehicle: {
      count: jest.fn(async (args: { where: { organizationId: string } }) =>
        args.where.organizationId === ORG_A ? 2 : 0,
      ),
      findMany: jest.fn(
        async (args: {
          where: { organizationId: string };
          select?: Record<string, boolean>;
          skip?: number;
          take?: number;
        }) => {
          if (args.where.organizationId !== ORG_A) return [];
          const all = [VEHICLE_A];
          const skip = args.skip ?? 0;
          const take = args.take ?? 50;
          return all
            .slice(skip, skip + take)
            .map((v) => projectPrismaSelect(v, args.select));
        },
      ),
      findFirst: jest.fn(
        async (args: {
          where: { id?: string; organizationId?: string };
          select?: Record<string, boolean>;
        }) => {
          const id = args.where.id;
          const orgId = args.where.organizationId;
          const row = id === VEHICLE_A.id ? VEHICLE_A : id === VEHICLE_B.id ? VEHICLE_B : null;
          if (!row || (orgId && row.organizationId !== orgId)) return null;
          return projectPrismaSelect(row, args.select);
        },
      ),
    },
  };

  function signUserToken(claims: Record<string, unknown>): string {
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

  function bearerUser(claims: Record<string, unknown>): string {
    return `Bearer ${signUserToken(claims)}`;
  }

  function serviceToken(orgId: string) {
    return jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: orgId,
        product: ProductSlug.RENTAL,
        scopes: ['core:entitlements:read'],
        cid: 'client-db-1',
        cv: 1,
        gv: 1,
        jti: 'jti-vehicle-read-test',
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

  const listRoute = (orgId: string) =>
    `/api/v1/core/read/v1/organizations/${orgId}/vehicles?productSlug=RENTAL`;
  const singleRoute = (orgId: string, vehicleId: string) =>
    `/api/v1/core/read/v1/organizations/${orgId}/vehicles/${vehicleId}?productSlug=RENTAL`;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: jwtSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreVehicleReadV1Controller],
      providers: [
        CoreVehicleReadV1Service,
        CoreVehicleReadProductGuard,
        Reflector,
        OrgScopingGuard,
        PermissionsGuard,
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

  it('allows authorized org member with fleet.read and active product license', async () => {
    const res = await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(200);

    expect(res.body.version).toBe(CORE_VEHICLE_READ_CONTRACT_VERSION);
    expect(res.body.vehicles).toHaveLength(1);
    expect(Object.keys(res.body.vehicles[0]).sort()).toEqual(ALLOWED_VEHICLE_DTO_KEYS.sort());
    expect(res.body.vehicles[0]).not.toHaveProperty('assignedBookingId');
    expect(res.body.vehicles[0]).not.toHaveProperty('vin');
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1 });
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: CORE_VEHICLE_IDENTITY_V1_SELECT }),
    );
  });

  it('denies when JWT org matches path but membership was revoked', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_REVOKED_MEMBERSHIP, organizationId: ORG_A }),
      )
      .expect(403);
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_REVOKED_MEMBERSHIP,
          organizationId: ORG_A,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('denies foreign organization access', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_FOREIGN, organizationId: ORG_B }),
      )
      .expect(403);
  });

  it('denies foreign vehicle within authorized org', async () => {
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEHICLE_B.id))
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(404);
  });

  it('denies missing fleet.read permission', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_NO_FLEET, organizationId: ORG_A }),
      )
      .expect(403);
  });

  it('denies when product license is not active for organization', async () => {
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(403);
  });

  it('denies service JWT (M2M allowlist unchanged)', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set('Authorization', `Bearer ${serviceToken(ORG_A)}`)
      .expect(401);
  });

  it('rejects invalid pagination query parameters with 400', async () => {
    const auth = bearerUser({ id: USER_MEMBER, organizationId: ORG_A });
    const base = listRoute(ORG_A);
    await request(app.getHttpServer()).get(`${base}&page=abc`).set('Authorization', auth).expect(400);
    await request(app.getHttpServer()).get(`${base}&page=1.5`).set('Authorization', auth).expect(400);
    await request(app.getHttpServer()).get(`${base}&limit=-1`).set('Authorization', auth).expect(400);
    await request(app.getHttpServer())
      .get(`${base}&page=9007199254740991&limit=100`)
      .set('Authorization', auth)
      .expect(400);
    await request(app.getHttpServer()).get(`${base}&limit=101`).set('Authorization', auth).expect(400);
  });

  it('active product license does not imply product-scoped vehicle list', async () => {
    const res = await request(app.getHttpServer())
      .get(listRoute(ORG_A))
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(200);

    expect(prisma.vehicle.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_A },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    const where = (prisma.vehicle.findMany as jest.Mock).mock.calls.at(-1)?.[0]?.where;
    expect(where).toEqual({ organizationId: ORG_A });
    expect(res.body.productSlug).toBe(ProductSlug.RENTAL);
  });

  it('paginates vehicle list', async () => {
    const res = await request(app.getHttpServer())
      .get(`${listRoute(ORG_A)}&page=1&limit=1`)
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(200);

    expect(prisma.vehicle.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('returns single vehicle without rental or internal fields', async () => {
    const res = await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEHICLE_A.id))
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(200);

    expect(res.body.vehicle.vehicleId).toBe(VEHICLE_A.id);
    expect(Object.keys(res.body.vehicle).sort()).toEqual(ALLOWED_VEHICLE_DTO_KEYS.sort());
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: CORE_VEHICLE_IDENTITY_V1_SELECT }),
    );
  });

  it('requires productSlug query parameter', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/core/read/v1/organizations/${ORG_A}/vehicles`)
      .set(
        'Authorization',
        bearerUser({ id: USER_MEMBER, organizationId: ORG_A }),
      )
      .expect(400);
  });
});
