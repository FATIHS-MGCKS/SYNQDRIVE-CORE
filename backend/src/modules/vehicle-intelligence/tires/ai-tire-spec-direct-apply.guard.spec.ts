import { TireSetupStatus } from '@prisma/client';
import { resolveDirectApplyTargetSetup } from './ai-tire-spec-direct-apply.guard';

const activeSetup = {
  id: 'setup-1',
  vehicleId: 'veh-1',
  status: TireSetupStatus.ACTIVE,
  removedAt: null,
  frontDimension: '225/45R17',
  rearDimension: null,
  loadIndexFront: '94',
  loadIndexRear: null,
  speedIndexFront: 'Y',
  speedIndexRear: null,
};

describe('resolveDirectApplyTargetSetup', () => {
  it('resolves bound active setup by tireSetupId', () => {
    const result = resolveDirectApplyTargetSetup({
      tireSetupId: 'setup-1',
      activeSetups: [activeSetup],
      boundSetup: activeSetup,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.setup.id).toBe('setup-1');
  });

  it('rejects inactive bound setup', () => {
    const removed = { ...activeSetup, removedAt: new Date() };
    const result = resolveDirectApplyTargetSetup({
      tireSetupId: 'setup-1',
      activeSetups: [],
      boundSetup: removed,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SETUP_NOT_ACTIVE');
  });
});
