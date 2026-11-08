import { assertOperatorAttestationEnvHasNoTestBypassV1 } from './fsd3-one-shot-attestation-test-policy.v1';
import { resolveFsd3OneShotExecutableReleaseShaV1 } from './fsd3-one-shot-executable-attestation.v1';

const SHA40 = /^[a-f0-9]{40}$/;

export function assertFsd3PreNodeApplicationGateV1(env: NodeJS.ProcessEnv = process.env): string {
  assertOperatorAttestationEnvHasNoTestBypassV1(env);
  if (env.FSD3_ONE_SHOT_TRUSTED_LAUNCHER !== '1') {
    throw new Error('FSD3_TRUSTED_LAUNCHER_REQUIRED');
  }
  const stamped = env.FSD3_PRE_NODE_ATTEST_SHA?.trim();
  if (!stamped || !SHA40.test(stamped)) {
    throw new Error('FSD3_PRE_NODE_ATTEST_MISSING');
  }
  const reverified = resolveFsd3OneShotExecutableReleaseShaV1({ env });
  if (reverified !== stamped) {
    throw new Error('FSD3_PRE_NODE_ATTEST_STALE');
  }
  return reverified;
}
