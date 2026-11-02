import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { ApdsMasterIntelligenceReadController } from './apds-master-intelligence-read.controller';

describe('ApdsMasterIntelligenceReadController security', () => {
  it('requires MASTER_ADMIN and RolesGuard without MFA step-up', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ApdsMasterIntelligenceReadController) as string[];
    expect(roles).toContain('MASTER_ADMIN');
    const guards = Reflect.getMetadata('__guards__', ApdsMasterIntelligenceReadController) as Array<{
      name: string;
    }>;
    expect(guards?.map((g) => g.name)).toEqual([RolesGuard.name]);
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, ApdsMasterIntelligenceReadController),
    ).toBeUndefined();
  });
});
