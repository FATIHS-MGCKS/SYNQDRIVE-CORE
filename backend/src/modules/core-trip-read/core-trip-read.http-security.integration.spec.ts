import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProductSlug, TripStatus } from '@prisma/client';
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
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CORE_TRIP_READ_V1_SELECT, CoreTripReadV1Service } from './core-trip-read.v1.service';
import { CoreTripReadV1Controller } from './core-trip-read.v1.controller';
import { CORE_TRIP_READ_CONTRACT_VERSION } from './core-trip-read.v1.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const TRIP_PUBLIC = 'trip-public';
const TRIP_PRIVATE = 'trip-private';
const TRIP_OTHER_VEHICLE = 'trip-other-veh';
const USER_MEMBER = 'user-member';
const USER_FOREIGN = 'user-foreign';
const USER_NO_FLEET = 'user-no-fleet';

const TRIPS: Record<
  string,
  {
    id: string;
    vehicleId: string;
    organizationId: string;
    isPrivateTrip: boolean;
    tripStatus: TripStatus;
    startTime: Date;
    endTime: Date | null;
    distanceKm: number | null;
    assignedBookingId?: string;
    startLatitude?: number;
  }
> = {
  [TRIP_PUBLIC]: {
    id: TRIP_PUBLIC,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-01T10:00:00.000Z'),
    endTime: new Date('2026-05-01T11:00:00.000Z'),
    distanceKm: 22,
    assignedBookingId: 'booking-secret',
    startLatitude: 48.1,
  },
  [TRIP_PRIVATE]: {
    id: TRIP_PRIVATE,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: true,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-02T10:00:00.000Z'),
    endTime: null,
    distanceKm: 5,
  },
  [TRIP_OTHER_VEHICLE]: {
    id: TRIP_OTHER_VEHICLE,
    vehicleId: VEH_B,
    organizationId: ORG_B,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-03T10:00:00.000Z'),
    endTime: null,
    distanceKm: 8,
  },
  'trip-sort-a': {
    id: 'trip-sort-a',
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-01T10:00:00.000Z'),
    endTime: null,
    distanceKm: 1,
  },
  'trip-sort-b': {
    id: 'trip-sort-b',
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-01T10:00:00.000Z'),
    endTime: null,
    distanceKm: 2,
  },
};

const VEHICLES: Record<string, { id: string; organizationId: string }> = {
  [VEH_A]: { id: VEH_A, organizationId: ORG_A },
  [VEH_B]: { id: VEH_B, organizationId: ORG_B },
};

const ALLOWED_TRIP_KEYS = [
  'version',
  'tripId',
  'vehicleId',
  'tripStatus',
  'startTime',
  'endTime',
  'distanceKm',
];

function projectSelect(full: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) return { ...full };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key] === true && key in full) out[key] = full[key];
  }
  return out;
}

function matchesTripWhere(
  trip: (typeof TRIPS)[string],
  where: {
    id?: string;
    vehicleId?: string;
    isPrivateTrip?: boolean;
    vehicle?: { organizationId?: string };
  },
): boolean {
  if (where.id && trip.id !== where.id) return false;
  if (where.vehicleId && trip.vehicleId !== where.vehicleId) return false;
  if (where.isPrivateTrip !== undefined && trip.isPrivateTrip !== where.isPrivateTrip) return false;
  if (where.vehicle?.organizationId && trip.organizationId !== where.vehicle.organizationId) {
    return false;
  }
  return true;
}

describe('CoreTripReadV1Controller — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p3-trip-read-http-security-secret';
  const m2mSecret = 'p3-trip-read-m2m-secret';

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B ? { id: args.where.id } : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
          const memberships: Record<string, { role: string; permissions: unknown } | null> = {
            [`${USER_MEMBER}|${ORG_A}`]: {
              role: 'WORKER',
              permissions: { fleet: { read: true } },
            },
            [`${USER_FOREIGN}|${ORG_A}`]: null,
            [`${USER_FOREIGN}|${ORG_B}`]: { role: 'WORKER', permissions: { fleet: { read: true } } },
            [`${USER_NO_FLEET}|${ORG_A}`]: {
              role: 'WORKER',
              permissions: { fleet: { read: false } },
            },
          };
          const key = `${args.where.userId}|${args.where.organizationId}`;
          const row = memberships[key];
          if (!row) return null;
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          return { id: `mem-${key}`, role: row.role, permissions: row.permissions };
        },
      ),
    },
    organizationProduct: {
      findFirst: jest.fn(
        async (args: { where: { organizationId: string; product: { slug: string } } }) => {
          if (args.where.organizationId === ORG_A && args.where.product.slug === ProductSlug.RENTAL) {
            return { id: 'op-rental' };
          }
          return null;
        },
      ),
    },
    vehicle: {
      findFirst: jest.fn(async (args: { where: { id?: string; organizationId?: string } }) => {
        const id = args.where.id;
        if (!id) return null;
        const row = VEHICLES[id];
        if (!row) return null;
        if (args.where.organizationId && row.organizationId !== args.where.organizationId) return null;
        return { id: row.id };
      }),
    },
    vehicleTrip: {
      count: jest.fn(async (args: { where: Record<string, unknown> }) =>
        Object.values(TRIPS).filter((t) => matchesTripWhere(t, args.where as never)).length,
      ),
      findMany: jest.fn(
        async (args: {
          where: Record<string, unknown>;
          select?: Record<string, boolean>;
          skip?: number;
          take?: number;
        }) => {
          const matched = Object.values(TRIPS)
            .filter((t) => matchesTripWhere(t, args.where as never))
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime() || b.id.localeCompare(a.id));
          const skip = args.skip ?? 0;
          const take = args.take ?? 50;
          return matched
            .slice(skip, skip + take)
            .map((t) => projectSelect(t, args.select));
        },
      ),
      findFirst: jest.fn(
        async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
          const trip = Object.values(TRIPS).find((t) => matchesTripWhere(t, args.where as never));
          return trip ? projectSelect(trip, args.select) : null;
        },
      ),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  function bearerUser(claims: Record<string, unknown>): string {
    const token = jwt.sign(
      {
        sub: claims.id,
        email: `${claims.id}@test.local`,
        platformRole: 'USER',
        organizationId: claims.organizationId,
      },
      jwtSecret,
      { expiresIn: '1h' },
    );
    return `Bearer ${token}`;
  }

  const listRoute = (org: string, veh: string) =>
    `/api/v1/core/read/v1/organizations/${org}/vehicles/${veh}/trips?productSlug=RENTAL`;
  const singleRoute = (org: string, veh: string, tripId: string) =>
    `/api/v1/core/read/v1/organizations/${org}/vehicles/${veh}/trips/${tripId}?productSlug=RENTAL`;

  beforeAll(async () => {
    process.env = { ...originalEnv, JWT_SECRET: jwtSecret, CORE_APP_M2M_ENABLED: 'true', CORE_APP_M2M_SIGNING_SECRET: m2mSecret };
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreTripReadV1Controller],
      providers: [
        CoreTripReadV1Service,
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

  it('allows authorized trip list', async () => {
    const res = await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(res.body.version).toBe(CORE_TRIP_READ_CONTRACT_VERSION);
    expect(res.body.trips.length).toBeGreaterThanOrEqual(1);
    expect(res.body.trips.some((t: { tripId: string }) => t.tripId === TRIP_PUBLIC)).toBe(true);
    expect(Object.keys(res.body.trips[0]).sort()).toEqual(ALLOWED_TRIP_KEYS.sort());
    expect(prisma.vehicleTrip.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ select: CORE_TRIP_READ_V1_SELECT }),
    );
  });

  it('denies foreign organization', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_FOREIGN, organizationId: ORG_B }))
      .expect(403);
  });

  it('denies foreign vehicle with 404', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_B))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('returns 404 when trip belongs to another vehicle', async () => {
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_OTHER_VEHICLE))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('denies missing fleet.read', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_NO_FLEET, organizationId: ORG_A }))
      .expect(403);
  });

  it('denies inactive product license', async () => {
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(403);
  });

  it('denies service JWT', async () => {
    const token = jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        org: ORG_A,
        product: ProductSlug.RENTAL,
        scopes: ['core:entitlements:read'],
        cid: 'c1',
        cv: 1,
        gv: 1,
        jti: 'jti-1',
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
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('excludes private trips from list and single read', async () => {
    const list = await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(list.body.trips.every((t: { tripId: string }) => t.tripId !== TRIP_PRIVATE)).toBe(true);
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_PRIVATE))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('does not expose booking or GPS fields in response', async () => {
    const res = await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_PUBLIC))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(res.body.trip).not.toHaveProperty('assignedBookingId');
    expect(res.body.trip).not.toHaveProperty('startLatitude');
    expect(res.body.trip).not.toHaveProperty('bookingCustomerId');
  });

  it('paginates with stable startTime and id ordering', async () => {
    const res = await request(app.getHttpServer())
      .get(`${listRoute(ORG_A, VEH_A)}&page=1&limit=1`)
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(prisma.vehicleTrip.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        take: 1,
      }),
    );
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.trips).toHaveLength(1);
  });

  it('does not perform database writes', async () => {
    await request(app.getHttpServer())
      .get(listRoute(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(prisma.vehicleTrip.update).not.toHaveBeenCalled();
    expect(prisma.vehicleTrip.create).not.toHaveBeenCalled();
  });
});
