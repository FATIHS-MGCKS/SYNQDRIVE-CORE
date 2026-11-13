import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProductSlug } from '@prisma/client';
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
import {
  CORE_DS4_ASSESSMENT_READ_V1_SELECT,
  CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT,
} from './core-driving-assessment-read.v1.service';
import { CoreDrivingAssessmentReadV1Controller } from './core-driving-assessment-read.v1.controller';
import { CoreDrivingAssessmentReadV1Service } from './core-driving-assessment-read.v1.service';
import { CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION } from './core-driving-assessment-read.v1.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const VEH_A2 = 'veh-a2';
const TRIP_ASSESSED = 'trip-assessed';
const TRIP_NO_ASSESSMENT = 'trip-no-assessment';
const TRIP_SAME_ORG_OTHER = 'trip-same-org-other';
const TRIP_GAP_SUFFIX = 'trip-gap-suffix';
const USER_MEMBER = 'user-member';
const USER_FOREIGN = 'user-foreign';
const USER_NO_FLEET = 'user-no-fleet';
const USER_REVOKED_MEMBERSHIP = 'user-revoked-membership';

const TRIPS: Record<string, { id: string; vehicleId: string; organizationId: string }> = {
  [TRIP_ASSESSED]: { id: TRIP_ASSESSED, vehicleId: VEH_A, organizationId: ORG_A },
  [TRIP_NO_ASSESSMENT]: { id: TRIP_NO_ASSESSMENT, vehicleId: VEH_A, organizationId: ORG_A },
  [TRIP_SAME_ORG_OTHER]: { id: TRIP_SAME_ORG_OTHER, vehicleId: VEH_A2, organizationId: ORG_A },
  [TRIP_GAP_SUFFIX]: { id: TRIP_GAP_SUFFIX, vehicleId: VEH_A, organizationId: ORG_A },
};

const VEHICLES: Record<string, { id: string; organizationId: string }> = {
  [VEH_A]: { id: VEH_A, organizationId: ORG_A },
  [VEH_B]: { id: VEH_B, organizationId: ORG_B },
  [VEH_A2]: { id: VEH_A2, organizationId: ORG_A },
};

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
      parent_id: 'trip-gap-parent',
      suffix_start: new Date('2026-04-20T08:40:00.000Z'),
      split_from: 'trip-gap-parent',
      split_second_start_at: null,
    },
  ],
};

const ALLOWED_RESPONSE_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'tripId',
  'productSlug',
  'assessmentAvailability',
  'assessmentVersion',
  'assessmentStatus',
  'evidenceQuality',
  'assessmentComputedAt',
  'scorePublicationStatus',
];

const FORBIDDEN_RESPONSE_KEYS = [
  'operationalLoadIndex',
  'operationalLoad',
  'inputFingerprint',
  'eventSummaries',
  'reasonCodes',
  'processingError',
  'publicationReason',
  'longitudinalLoadObservablesV1',
  'assignedBookingId',
  'rawDetectionMeta',
];

function matchesTripWhere(
  trip: (typeof TRIPS)[string],
  where: {
    id?: string | { equals?: string; notIn?: string[] };
    vehicleId?: string;
    vehicle?: { organizationId?: string };
  },
): boolean {
  if (typeof where.id === 'string' && trip.id !== where.id) return false;
  if (where.id && typeof where.id === 'object') {
    if (where.id.equals !== undefined && trip.id !== where.id.equals) return false;
    if (where.id.notIn?.includes(trip.id)) return false;
  }
  if (where.vehicleId && trip.vehicleId !== where.vehicleId) return false;
  if (where.vehicle?.organizationId && trip.organizationId !== where.vehicle.organizationId) {
    return false;
  }
  return true;
}

describe('CoreDrivingAssessmentReadV1Controller — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p3-driving-assessment-http-security-secret';
  const m2mSecret = 'p3-driving-assessment-m2m-secret';

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
            [`${USER_REVOKED_MEMBERSHIP}|${ORG_A}`]: null,
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
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        const trip = Object.values(TRIPS).find((t) => matchesTripWhere(t, args.where as never));
        return trip ? { id: trip.id } : null;
      }),
    },
    diV0Ds4TripAssessmentV1: {
      findFirst: jest.fn(
        async (args: {
          where: { organizationId: string; vehicleId: string; tripId: string };
          select?: Record<string, boolean>;
        }) => {
          if (args.where.tripId !== TRIP_ASSESSED) return null;
          return {
            id: 'asm-1',
            assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
            assessmentStatus: 'UNRATED_COUNTS_ONLY',
            evidenceQuality: 'PRESENT',
            computedAt: new Date('2026-06-01T12:00:00.000Z'),
          };
        },
      ),
      update: jest.fn(),
      create: jest.fn(),
    },
    diV0Ds4TripDrivingImpactV2: {
      findUnique: jest.fn(async () => ({
        operationalLoadIndex: 99,
        scorePublicationStatus: 'DISABLED_MODEL_NOT_CALIBRATED',
        publicationReason: 'MODEL_NOT_CALIBRATED',
        eventSummariesJson: { secret: true },
      })),
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

  const route = (org: string, veh: string, trip: string) =>
    `/api/v1/core/read/v1/organizations/${org}/vehicles/${veh}/trips/${trip}/driving-assessment?productSlug=RENTAL`;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: jwtSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreDrivingAssessmentReadV1Controller],
      providers: [
        CoreDrivingAssessmentReadV1Service,
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

  it('allows authorized read with explicit DS4 select allowlist', async () => {
    const res = await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(res.body.version).toBe(CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION);
    expect(res.body.assessmentAvailability).toBe('AVAILABLE');
    expect(res.body.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
    expect(Object.keys(res.body).sort()).toEqual(ALLOWED_RESPONSE_KEYS.sort());
    expect(prisma.diV0Ds4TripAssessmentV1.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ select: CORE_DS4_ASSESSMENT_READ_V1_SELECT }),
    );
    expect(prisma.diV0Ds4TripDrivingImpactV2.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ select: CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT }),
    );
  });

  it('returns NOT_AVAILABLE when assessment missing', async () => {
    const res = await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_NO_ASSESSMENT))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(res.body.assessmentAvailability).toBe('NOT_AVAILABLE');
    expect(res.body.assessmentVersion).toBeNull();
    expect(res.body.scorePublicationStatus).toBeNull();
  });

  it('denies foreign organization', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_FOREIGN, organizationId: ORG_B }))
      .expect(403);
  });

  it('denies foreign vehicle with 404', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_B, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('returns 404 for trip on another vehicle in the same organization', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_SAME_ORG_OTHER))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('denies when JWT org matches path but membership was revoked', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_REVOKED_MEMBERSHIP, organizationId: ORG_A }))
      .expect(403);
    expect(prisma.organizationMembership.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_REVOKED_MEMBERSHIP,
          organizationId: ORG_A,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('denies missing fleet.read', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_NO_FLEET, organizationId: ORG_A }))
      .expect(403);
  });

  it('denies inactive product license', async () => {
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
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
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns 404 for reconciled gap-split suffix trip', async () => {
    const assessmentCallsBefore = (prisma.diV0Ds4TripAssessmentV1.findFirst as jest.Mock).mock.calls.length;
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_GAP_SUFFIX))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
    expect((prisma.diV0Ds4TripAssessmentV1.findFirst as jest.Mock).mock.calls.length).toBe(
      assessmentCallsBefore,
    );
  });

  it('does not expose numeric scores or internal raw fields', async () => {
    const res = await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    for (const key of FORBIDDEN_RESPONSE_KEYS) {
      expect(res.body).not.toHaveProperty(key);
    }
    expect(res.body.operationalLoadIndex).toBeUndefined();
  });

  it('does not perform database writes', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A, TRIP_ASSESSED))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);
    expect(prisma.diV0Ds4TripAssessmentV1.create).not.toHaveBeenCalled();
    expect(prisma.diV0Ds4TripAssessmentV1.update).not.toHaveBeenCalled();
  });
});
