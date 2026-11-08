import {
  assertOperatorAttestationEnvHasNoTestBypassV1,
  __setFsd3AttestationTestPolicyForJestV1,
} from '../fsd3-one-shot-attestation-test-policy.v1';
import { resolveFsd3OneShotExecutableReleaseShaV1 } from '../fsd3-one-shot-executable-attestation.v1';
import { assertFsd3OneShotTrustedLauncherV1 } from '../fsd3-one-shot-runtime-launch-guard.v1';

describe('Fsd3 operator attestation bypass forbidden', () => {
  afterEach(() => {
    __setFsd3AttestationTestPolicyForJestV1(null);
  });

  it('rejects RELAXED env override', () => {
    expect(() =>
      assertOperatorAttestationEnvHasNoTestBypassV1({
        FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED: '1',
      }),
    ).toThrow('FSD3_EXECUTABLE_RELAXED_BYPASS_FORBIDDEN');
  });

  it('rejects SKIP_TRUSTED_LAUNCHER env override', () => {
    expect(() =>
      assertOperatorAttestationEnvHasNoTestBypassV1({
        FSD3_ONE_SHOT_SKIP_TRUSTED_LAUNCHER: '1',
      }),
    ).toThrow('FSD3_TRUSTED_LAUNCHER_SKIP_FORBIDDEN');
  });

  it('rejects RELAXED during resolve even under jest unless jest policy hook set', () => {
    expect(() =>
      resolveFsd3OneShotExecutableReleaseShaV1({
        env: { FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED: '1' },
      }),
    ).toThrow('FSD3_EXECUTABLE_RELAXED_BYPASS_FORBIDDEN');
  });

  it('allows jest policy hook without env RELAXED', () => {
    __setFsd3AttestationTestPolicyForJestV1('RELAXED_WORKTREE_ONLY');
    const env = { PATH: process.env.PATH, HOME: process.env.HOME ?? '/root', LANG: 'C.UTF-8' };
    const sha = resolveFsd3OneShotExecutableReleaseShaV1({ env });
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('EXECUTE path rejects untrusted launcher without pre-node stamp', () => {
    expect(() =>
      assertFsd3OneShotTrustedLauncherV1({
        cliMode: 'EXECUTE',
        env: { FSD3_ONE_SHOT_TRUSTED_LAUNCHER: '1' },
      }),
    ).toThrow('FSD3_PRE_NODE_ATTEST_MISSING');
  });
});
