import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VsiMasterIntelligenceReadController } from './vsi-master-intelligence-read.controller';

describe('VsiMasterIntelligenceReadController security', () => {
  it('requires MASTER_ADMIN and RolesGuard without MFA step-up (owner-deferred)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VsiMasterIntelligenceReadController) as string[];
    expect(roles).toEqual(['MASTER_ADMIN']);

    const classGuards = Reflect.getMetadata('__guards__', VsiMasterIntelligenceReadController) as
      | { name: string }[]
      | undefined;
    expect(classGuards?.map((g) => g.name)).toEqual([RolesGuard.name]);
    expect(
      Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, VsiMasterIntelligenceReadController),
    ).toBeUndefined();
  });
});
