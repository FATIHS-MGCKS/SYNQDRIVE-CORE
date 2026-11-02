import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { PdiMasterIntelligenceReadController } from './pdi-master-intelligence-read.controller';

describe('PdiMasterIntelligenceReadController security', () => {
  it('requires MASTER_ADMIN and RolesGuard without MFA step-up', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PdiMasterIntelligenceReadController) as string[];
    expect(roles).toContain('MASTER_ADMIN');
    const guards = Reflect.getMetadata('__guards__', PdiMasterIntelligenceReadController) as Array<{
      name: string;
    }>;
    expect(guards?.map((g) => g.name)).toEqual([RolesGuard.name]);
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, PdiMasterIntelligenceReadController),
    ).toBeUndefined();
  });
});
