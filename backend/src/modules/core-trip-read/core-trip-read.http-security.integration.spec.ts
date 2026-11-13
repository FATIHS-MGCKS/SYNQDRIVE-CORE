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
const VEH_A2 = 'veh-a2';
const TRIP_PUBLIC = 'trip-public';
const TRIP_UNASSIGNED = 'trip-unassigned';
const TRIP_ONGOING = 'trip-ongoing';
const TRIP_OTHER_VEHICLE = 'trip-other-veh';
const TRIP_SAME_ORG_OTHER_VEHICLE = 'trip-same-org-other-veh';
const TRIP_GAP_PARENT = 'trip-gap-parent';
const TRIP_GAP_SUFFIX = 'trip-gap-suffix';
const TRIP_CANCELLED_UNRELATED = 'trip-cancelled-unrelated';
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
    bookingCustomerId?: string;
    assignedDriverId?: string;
    driverName?: string;
    startLatitude?: number;
    rawDetectionMeta?: Record<string, unknown>;
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
    bookingCustomerId: 'customer-secret',
    assignedDriverId: 'driver-secret',
    driverName: 'Driver Secret',
    startLatitude: 48.1,
    rawDetectionMeta: { splitFrom: 'secret' },
  },
  // PRIVATE_UNASSIGNED attribution fallback: completed, no booking, no driver.
  [TRIP_UNASSIGNED]: {
    id: TRIP_UNASSIGNED,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: true,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-02T10:00:00.000Z'),
    endTime: new Date('2026-05-02T10:30:00.000Z'),
    distanceKm: 5,
  },
  [TRIP_ONGOING]: {
    id: TRIP_ONGOING,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.ONGOING,
    startTime: new Date('2026-05-04T10:00:00.000Z'),
    endTime: null,
    distanceKm: null,
  },
  [TRIP_SAME_ORG_OTHER_VEHICLE]: {
    id: TRIP_SAME_ORG_OTHER_VEHICLE,
    vehicleId: VEH_A2,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-05-03T12:00:00.000Z'),
    endTime: null,
    distanceKm: 3,
  },
  [TRIP_GAP_PARENT]: {
    id: TRIP_GAP_PARENT,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-04-20T08:00:00.000Z'),
    endTime: new Date('2026-04-20T09:00:00.000Z'),
    distanceKm: 40,
  },
  [TRIP_GAP_SUFFIX]: {
    id: TRIP_GAP_SUFFIX,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.CANCELLED,
    startTime: new Date('2026-04-20T08:40:00.000Z'),
    endTime: new Date('2026-04-20T08:41:00.000Z'),
    distanceKm: null,
  },
  [TRIP_CANCELLED_UNRELATED]: {
    id: TRIP_CANCELLED_UNRELATED,
    vehicleId: VEH_A,
    organizationId: ORG_A,
    isPrivateTrip: false,
    tripStatus: TripStatus.CANCELLED,
    startTime: new Date('2026-04-18T08:00:00.000Z'),
    endTime: new Date('2026-04-18T08:01:00.000Z'),
    distanceKm: null,
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
  [VEH_A2]: { id: VEH_A2, organizationId: ORG_A },
};

/**
 * Rows the reconciled-suffix SQL would return per vehicle. Lineage is still checked by the real
 * helper: the unrelated CANCELLED trip's start does not match the parent's split anchor, so it stays visible.
 */
const SUFFIX_SQL_CANDIDATES: Record<
  string,
  Array<{
    suffix_id: string;
    parent_id: string;
    suffix_start: Date;
    split_from: string | null;
    split_second_start_at: string | null;
  }>
> = {
  [VEH_A]: [
    {
      suffix_id: TRIP_GAP_SUFFIX,
      parent_id: TRIP_GAP_PARENT,
      suffix_start: TRIPS[TRIP_GAP_SUFFIX].startTime,
      split_from: TRIP_GAP_PARENT,
      split_second_start_at: null,
    },
    {
      suffix_id: TRIP_CANCELLED_UNRELATED,
      parent_id: TRIP_GAP_PARENT,
      suffix_start: TRIPS[TRIP_CANCELLED_UNRELATED].startTime,
      split_from: null,
      split_second_start_at: TRIPS[TRIP_GAP_SUFFIX].startTime.toISOString(),
    },
  ],
};

const VEH_A_VISIBLE_TRIP_IDS = Object.values(TRIPS)
  .filter((t) => t.vehicleId === VEH_A && t.id !== TRIP_GAP_SUFFIX)
  .map((t) => t.id)
  .sort();

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
    id?: string | { equals?: string; notIn?: string[] };
    vehicleId?: string;
    isPrivateTrip?: boolean;
    vehicle?: { organizationId?: string };
  },
): boolean {
  if (typeof where.id === 'string' && trip.id !== where.id) return false;
  if (where.id && typeof where.id === 'object') {
    if (where.id.equals !== undefined && trip.id !== where.id.equals) return false;
    if (where.id.notIn?.includes(trip.id)) return false;
  }
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
    $queryRaw: jest.fn(async (_sql: TemplateStringsArray, vehicleId: string) =>
      SUFFIX_SQL_CANDIDATES[vehicleId] ?? [],
    ),
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

  it('returns 404 for a trip of another vehicle in the same organization', async () => {
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_SAME_ORG_OTHER_VEHICLE))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A2, TRIP_SAME_ORG_OTHER_VEHICLE))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
  });

  it('keeps unassigned completed and ONGOING trips readable regardless of booking assignment', async () => {
    const list = await request(app.getHttpServer())
      .get(`${listRoute(ORG_A, VEH_A)}&limit=100`)
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    const ids = list.body.trips.map((t: { tripId: string }) => t.tripId);
    expect(ids).toEqual(expect.arrayContaining([TRIP_PUBLIC, TRIP_UNASSIGNED, TRIP_ONGOING]));
    expect(prisma.vehicleTrip.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ isPrivateTrip: expect.anything() }) }),
    );

    for (const tripId of [TRIP_PUBLIC, TRIP_UNASSIGNED, TRIP_ONGOING]) {
      const res = await request(app.getHttpServer())
        .get(singleRoute(ORG_A, VEH_A, tripId))
        .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
        .expect(200);
      expect(Object.keys(res.body.trip).sort()).toEqual([...ALLOWED_TRIP_KEYS].sort());
    }
    const ongoing = list.body.trips.find((t: { tripId: string }) => t.tripId === TRIP_ONGOING);
    expect(ongoing).toMatchObject({ tripStatus: TripStatus.ONGOING, endTime: null, distanceKm: null });
  });

  it('hides reconciled gap-split suffix in list, count and detail; keeps parent and unrelated CANCELLED', async () => {
    const list = await request(app.getHttpServer())
      .get(`${listRoute(ORG_A, VEH_A)}&limit=100`)
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    const ids = list.body.trips.map((t: { tripId: string }) => t.tripId);
    expect([...ids].sort()).toEqual(VEH_A_VISIBLE_TRIP_IDS);
    expect(ids).toContain(TRIP_GAP_PARENT);
    expect(ids).toContain(TRIP_CANCELLED_UNRELATED);
    expect(ids).not.toContain(TRIP_GAP_SUFFIX);
    expect(list.body.pagination.total).toBe(VEH_A_VISIBLE_TRIP_IDS.length);

    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_GAP_SUFFIX))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
    await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_GAP_PARENT))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    const unrelated = await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_CANCELLED_UNRELATED))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(unrelated.body.trip.tripStatus).toBe(TripStatus.CANCELLED);
  });

  it('does not expose booking, driver, customer, GPS or detection fields in response', async () => {
    const res = await request(app.getHttpServer())
      .get(singleRoute(ORG_A, VEH_A, TRIP_PUBLIC))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    for (const key of [
      'assignedBookingId',
      'bookingCustomerId',
      'assignedDriverId',
      'actualDriverId',
      'driverName',
      'isPrivateTrip',
      'startLatitude',
      'rawDetectionMeta',
    ]) {
      expect(res.body.trip).not.toHaveProperty(key);
    }
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
