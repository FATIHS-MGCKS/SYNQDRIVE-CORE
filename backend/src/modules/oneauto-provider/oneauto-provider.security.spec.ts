import { OneAutoProviderController } from './oneauto-provider.controller';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

describe('OneAutoProviderController security characterization', () => {
  it('requires MASTER_ADMIN on controller', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, OneAutoProviderController);
    expect(roles).toEqual(['MASTER_ADMIN']);
  });

  it('requires MFA step-up on chargeable execute route', () => {
    const action = Reflect.getMetadata(
      MASTER_ADMIN_MFA_ACTION_KEY,
      OneAutoProviderController.prototype.execute,
    );
    expect(action).toBe(STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE);
  });
});
