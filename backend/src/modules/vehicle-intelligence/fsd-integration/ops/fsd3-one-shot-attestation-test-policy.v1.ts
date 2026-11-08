/**
 * Jest-only attestation policy — not driven by operator environment variables.
 */
export type Fsd3AttestationTestPolicyV1 = 'FULL' | 'RELAXED_WORKTREE_ONLY';

let jestAttestationPolicy: Fsd3AttestationTestPolicyV1 | null = null;
let jestTrustedLauncherBypass = false;

function assertJestTestSurface(): void {
  if (process.env.JEST_WORKER_ID === undefined && process.env.NODE_ENV !== 'test') {
    throw new Error('FSD3_ATTESTATION_TEST_HOOK_FORBIDDEN');
  }
}

/** @internal Jest only */
export function __setFsd3AttestationTestPolicyForJestV1(policy: Fsd3AttestationTestPolicyV1 | null): void {
  assertJestTestSurface();
  jestAttestationPolicy = policy;
}

/** @internal Jest only */
export function __setFsd3TrustedLauncherTestBypassForJestV1(bypass: boolean): void {
  assertJestTestSurface();
  jestTrustedLauncherBypass = bypass;
}

export function resolveFsd3AttestationTestPolicyV1(): Fsd3AttestationTestPolicyV1 {
  return jestAttestationPolicy ?? 'FULL';
}

export function isFsd3TrustedLauncherTestBypassActiveV1(): boolean {
  return jestTrustedLauncherBypass === true;
}

export function assertOperatorAttestationEnvHasNoTestBypassV1(env: NodeJS.ProcessEnv = process.env): void {
  if (env.FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED?.trim()) {
    throw new Error('FSD3_EXECUTABLE_RELAXED_BYPASS_FORBIDDEN');
  }
  if (env.FSD3_ONE_SHOT_SKIP_TRUSTED_LAUNCHER?.trim()) {
    throw new Error('FSD3_TRUSTED_LAUNCHER_SKIP_FORBIDDEN');
  }
  if (env.FSD3_PRE_NODE_ATTEST_SHA?.trim() && env.FSD3_ONE_SHOT_TRUSTED_LAUNCHER !== '1') {
    throw new Error('FSD3_PRE_NODE_ATTEST_SPOOFED');
  }
}
