import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { TIRE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/tires/tire-health-consumer.tokens';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { HmSignalUsageService } from '@modules/high-mobility/high-mobility-signal-usage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreTireReadV1Controller } from './core-tire-read.v1.controller';
import { CoreTireReadV1Service } from './core-tire-read.v1.service';
import { CORE_TIRE_READ_CONTRACT_VERSION } from './core-tire-read.v1.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const USER_MEMBER = 'user-member';
const USER_NO_FLEET = 'user-no-fleet';

const ALLOWED_TOP_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'tireAvailability',
  'resolvedAt',
  'productiveWearModelVersion',
  'customerWearReadModel',
  'activeSetup',
  'tread',
  'remainingV2',
  'remainingV3',
  'overallStatus',
  'pressureStatus',
  'seasonStatus',
  'unevenWearStatus',
  'confidence',
  'measurement',
  'pressure',
  'inventory',
  'v3',
];

const tireHealth = { getSummary: jest.fn() };
const hm = { getTirePressureSignals: jest.fn() };

describe('CoreTireReadV1Controller — HTTP security integration', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p3-tire-http-security-secret';
  const m2mSecret = 'p3-tire-m2m-secret';

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
        if (id === VEH_A && args.where.organizationId === ORG_A) {
          return { id: VEH_A, organizationId: ORG_A };
        }
        if (id === VEH_B && args.where.organizationId === ORG_B) {
          return { id: VEH_B, organizationId: ORG_B };
        }
        return null;
      }),
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

  const route = (org: string, vehicle: string) =>
    `/api/v1/core/read/v1/organizations/${org}/vehicles/${vehicle}/tires?productSlug=RENTAL`;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: jwtSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
    };

    tireHealth.getSummary.mockResolvedValue(null);
    hm.getTirePressureSignals.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      controllers: [CoreTireReadV1Controller],
      providers: [
        CoreTireReadV1Service,
        CoreVehicleReadProductGuard,
        Reflector,
        OrgScopingGuard,
        PermissionsGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: TIRE_HEALTH_CONSUMER_EXPORT, useValue: tireHealth },
        { provide: HmSignalUsageService, useValue: hm },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              customerReadEnabled: false,
              customerReadAuthoritative: false,
            }),
          },
        },
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

  it('allows authorized tire read', async () => {
    const res = await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);

    expect(res.body.version).toBe(CORE_TIRE_READ_CONTRACT_VERSION);
    expect(Object.keys(res.body).sort()).toEqual(ALLOWED_TOP_KEYS.sort());
    expect(res.body).not.toHaveProperty('overallPercent');
    expect(hm.getTirePressureSignals).toHaveBeenCalledWith(VEH_A);
    expect(tireHealth.getSummary).toHaveBeenCalledWith(VEH_A, { hmTirePressure: null });
  });

  it('denies cross-org vehicle access with 404', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_B))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('denies missing fleet.read', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_NO_FLEET, organizationId: ORG_A }))
      .expect(403);
  });

  it('denies service JWT with 401', async () => {
    const serviceToken = jwt.sign(
      {
        typ: CORE_APP_SERVICE_TOKEN_TYPE,
        iss: CORE_APP_M2M_ISSUER,
        aud: CORE_APP_M2M_AUDIENCE,
        sub: 'svc-test',
      },
      m2mSecret,
      { expiresIn: '1h' },
    );
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A))
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(401);
  });
});