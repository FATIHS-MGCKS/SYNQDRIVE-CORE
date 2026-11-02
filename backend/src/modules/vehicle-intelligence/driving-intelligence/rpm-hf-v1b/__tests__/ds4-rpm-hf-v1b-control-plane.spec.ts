import {
  evaluateDs4RpmHfV1bEnablement,
  isDs4RpmHfV1bShadowRunnable,
  parseDs4RpmHfV1bControlPlaneConfig,
} from '../ds4-rpm-hf-v1b-control-plane';
import { isDs4RpmHfV1bWorkerRunnable, parseDs4RpmHfV1bRuntimeConfig } from '../ds4-rpm-hf-v1b.config';

describe('ds4-rpm-hf-v1b control plane defaults', () => {
  it('defaults fully dormant', () => {
    const cp = parseDs4RpmHfV1bControlPlaneConfig({});
    expect(isDs4RpmHfV1bShadowRunnable(cp)).toBe(false);
    const rt = parseDs4RpmHfV1bRuntimeConfig({});
    expect(isDs4RpmHfV1bWorkerRunnable(rt)).toBe(false);
  });

  it('requires enabledSince when flags on', () => {
    expect(() =>
      parseDs4RpmHfV1bRuntimeConfig({
        DS4_RPM_HF_V1B_SHADOW_ENABLED: 'true',
        DS4_RPM_HF_V1B_WORKER_ENABLED: 'true',
      }),
    ).toThrow(/ENABLED_SINCE/);
  });

  it('empty allowlist blocks enablement even when flags on', () => {
    const cp = parseDs4RpmHfV1bControlPlaneConfig({
      DS4_RPM_HF_V1B_SHADOW_ENABLED: 'true',
      DS4_RPM_HF_V1B_WORKER_ENABLED: 'true',
    });
    const en = evaluateDs4RpmHfV1bEnablement(cp, {
      organizationId: 'org',
      vehicleId: 'veh',
      vehicleOrganizationId: 'org',
    });
    expect(en.enabled).toBe(false);
    expect(en.reason).toBe('RPM_HF_V1B_ALLOWLIST_EMPTY');
  });
});
