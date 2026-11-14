import { Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';

describe('Vehicle product grants — MasterAdminMfaGuard (real guard)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('denies MASTER_ADMIN POST without step-up when MFA enforced', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.MASTER_ORGANIZATION) };
    const prisma = {
      userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'mfa-1' }) },
    };
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) };
    const guard = new MasterAdminMfaGuard(
      reflector as never,
      prisma as unknown as PrismaService,
      stepUp as unknown as IamMfaStepUpService,
    );
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: { id: 'admin-1', platformRole: UserPlatformRole.MASTER_ADMIN },
          headers: {},
        }),
      }),
    };

    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      response: { code: 'STEP_UP_REQUIRED' },
    });
  });
});