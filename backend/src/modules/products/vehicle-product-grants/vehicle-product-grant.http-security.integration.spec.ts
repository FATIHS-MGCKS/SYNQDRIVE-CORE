import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProductSlug, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { VehicleProductGrantAdminController } from './vehicle-product-grant.admin.controller';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const VEH = 'veh-1';
const MASTER = 'master-admin-1';
const MEMBER = 'member-1';

function bearerMaster() {
  return `Bearer master-${MASTER}`;
}

function bearerMember() {
  return `Bearer user-${MEMBER}`;
}

describe('Vehicle product grants — HTTP security integration', () => {
  const grants = {
    listGrantedVehicles: jest.fn(),
    grantExplicit: jest.fn(),
    revokeGrant: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    grants.grantExplicit.mockResolvedValue({
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      status: 'ACTIVE',
    });
  });

  const authGuard = {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole; organizationId?: string };
      };
      const auth = String(req.headers?.authorization ?? '');
      if (auth.startsWith('Bearer master-')) {
        req.user = { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      if (auth.startsWith('Bearer user-')) {
        req.user = { id: MEMBER, platformRole: UserPlatformRole.USER, organizationId: ORG };
        return true;
      }
      return false;
    },
  };

  it('rejects non-master admin grant write', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleProductGrantAdminController],
      providers: [
        { provide: VehicleProductGrantService, useValue: grants },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } } }) => {
          const user = ctx.switchToHttp().getRequest().user;
          return user?.platformRole === UserPlatformRole.MASTER_ADMIN;
        },
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const localApp = moduleRef.createNestApplication();
    await localApp.init();

    await request(localApp.getHttpServer())
      .post(`/admin/organizations/${ORG}/vehicles/${VEH}/product-grants`)
      .set('Authorization', bearerMember())
      .send({ productSlug: ProductSlug.RENTAL })
      .expect(403);

    await localApp.close();
  });

  it('allows MASTER_ADMIN grant with MFA guard satisfied', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleProductGrantAdminController],
      providers: [
        { provide: VehicleProductGrantService, useValue: grants },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } } }) => {
          const user = ctx.switchToHttp().getRequest().user;
          return user?.platformRole === UserPlatformRole.MASTER_ADMIN;
        },
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const localApp = moduleRef.createNestApplication();
    await localApp.init();

    await request(localApp.getHttpServer())
      .post(`/admin/organizations/${ORG}/vehicles/${VEH}/product-grants`)
      .set('Authorization', bearerMaster())
      .send({ productSlug: ProductSlug.RENTAL })
      .expect(201);

    expect(grants.grantExplicit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: MASTER,
      }),
    );

    await localApp.close();
  });

  it('rejects invalid productSlug on POST with 400', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleProductGrantAdminController],
      providers: [
        { provide: VehicleProductGrantService, useValue: grants },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } } }) =>
          ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const localApp = moduleRef.createNestApplication();
    await localApp.init();

    await request(localApp.getHttpServer())
      .post(`/admin/organizations/${ORG}/vehicles/${VEH}/product-grants`)
      .set('Authorization', bearerMaster())
      .send({ productSlug: 'INVALID' })
      .expect(400);

    await localApp.close();
  });
});