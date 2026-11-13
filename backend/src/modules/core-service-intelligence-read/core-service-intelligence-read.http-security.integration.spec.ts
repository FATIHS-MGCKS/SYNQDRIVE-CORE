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
import { SERVICE_COMPLIANCE_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/service-compliance/service-compliance-consumer.tokens';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreServiceIntelligenceReadV1Controller } from './core-service-intelligence-read.v1.controller';
import { CoreServiceIntelligenceReadV1Service } from './core-service-intelligence-read.v1.service';
import { CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION } from './core-service-intelligence-read.v1.types';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ORG_C = 'org-c-no-license';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const USER_MEMBER = 'user-member';
const USER_NO_FLEET = 'user-no-fleet';

const ALLOWED_TOP_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'nextServiceHeadline',
  'maintenancePositions',
  'positionsTotal',
  'positionsTruncated',
  'forecastComputedAt',
  'freshness',
  'forecastDataQuality',
  'conflicts',
];

const complianceStub = {
  evaluateNextServiceDetailed: jest.fn(),
};

describe('CoreServiceIntelligenceReadV1Controller — HTTP security', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const jwtSecret = 'p3-si-http-security-secret';
  const m2mSecret = 'p3-si-m2m-secret';

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const id = args.where.id;
        if (id === ORG_A || id === ORG_B || id === ORG_C) return { id };
        return null;
      }),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
          const memberships: Record<string, { role: string; permissions: unknown } | null> = {
            [`${USER_MEMBER}|${ORG_A}`]: { role: 'WORKER', permissions: { fleet: { read: true } } },
            [`${USER_MEMBER}|${ORG_C}`]: { role: 'WORKER', permissions: { fleet: { read: true } } },
            [`${USER_NO_FLEET}|${ORG_A}`]: { role: 'WORKER', permissions: { fleet: { read: false } } },
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
        async (args: { where: { organizationId: string; product: { slug: string }; status?: string } }) => {
          if (
            args.where.organizationId === ORG_A &&
            args.where.product.slug === ProductSlug.RENTAL &&
            args.where.status === 'ACTIVE'
          ) {
            return { id: 'op-rental' };
          }
          return null;
        },
      ),
    },
    vehicle: {
      findFirst: jest.fn(async (args: { where: { id?: string; organizationId?: string } }) => {
        if (args.where.id === VEH_A && args.where.organizationId === ORG_A) {
          return { id: VEH_A, organizationId: ORG_A };
        }
        if (args.where.id === VEH_B && args.where.organizationId === ORG_B) {
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
    `/api/v1/core/read/v1/organizations/${org}/vehicles/${vehicle}/service-intelligence?productSlug=RENTAL`;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: jwtSecret,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: m2mSecret,
    };

    complianceStub.evaluateNextServiceDetailed.mockResolvedValue({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 1000,
        timeToNextServiceDays: 20,
        lastUpdatedAt: '2026-06-01T10:00:00.000Z',
        serviceSourceLabel: 'HM/OEM',
        severity: 'GOOD',
        blocksRental: false,
        title: 't',
        description: 'd',
        message: 'm',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
        projectedDueDate: null,
        positionKind: 'INSPECTION',
        positionId: null,
        provenance: null,
        dataQuality: [],
        conflicts: [],
        computedComparison: null,
      },
      forecast: null,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [CoreServiceIntelligenceReadV1Controller],
      providers: [
        CoreServiceIntelligenceReadV1Service,
        CoreVehicleReadProductGuard,
        Reflector,
        OrgScopingGuard,
        PermissionsGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_COMPLIANCE_CONSUMER_EXPORT, useValue: complianceStub },
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

  it('allows authorized read', async () => {
    const res = await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(200);

    expect(res.body.version).toBe(CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION);
    expect(Object.keys(res.body).sort()).toEqual(ALLOWED_TOP_KEYS.sort());
    expect(complianceStub.evaluateNextServiceDetailed).toHaveBeenCalledWith(VEH_A);
  });

  it('denies cross-org vehicle with 404', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_B))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_A }))
      .expect(404);
  });

  it('denies missing fleet.read with 403', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_A, VEH_A))
      .set('Authorization', bearerUser({ id: USER_NO_FLEET, organizationId: ORG_A }))
      .expect(403);
  });

  it('denies inactive product license with 403', async () => {
    await request(app.getHttpServer())
      .get(route(ORG_C, VEH_A))
      .set('Authorization', bearerUser({ id: USER_MEMBER, organizationId: ORG_C }))
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
