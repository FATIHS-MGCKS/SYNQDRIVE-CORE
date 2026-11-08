import {
  assertOperatorAttestationEnvHasNoTestBypassV1,
  isFsd3TrustedLauncherTestBypassActiveV1,
} from './fsd3-one-shot-attestation-test-policy.v1';

const BLOCKED_NODE_ENV_KEYS = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_COMPILE_CACHE',
  'NODE_PENDING_DEPRECATION',
  'NODE_PENDING_PIPELINING',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_REPL_HISTORY',
] as const;

const BLOCKED_TS_NODE_KEYS = ['TS_NODE_TRANSPILE_ONLY', 'TS_NODE_PROJECT', 'TS_NODE_COMPILER'] as const;

/** Keys that must be unset unless tests explicitly skip launcher enforcement. */
export function assertFsd3NodeRuntimeEnvSanitizedV1(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of BLOCKED_NODE_ENV_KEYS) {
    if (env[key]?.trim()) {
      throw new Error('FSD3_NODE_RUNTIME_ENV_REJECTED');
    }
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('TS_NODE_') || key === 'NODE_EXTRA_CA_CERTS') {
      throw new Error('FSD3_NODE_RUNTIME_ENV_REJECTED');
    }
    for (const blocked of BLOCKED_TS_NODE_KEYS) {
      if (key === blocked && env[key]?.trim()) {
        throw new Error('FSD3_NODE_RUNTIME_ENV_REJECTED');
      }
    }
  }
  assertGitEnvironmentNotInjectedFromNodeV1(env);
}

function assertGitEnvironmentNotInjectedFromNodeV1(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) {
      throw new Error('FSD3_GIT_ENV_INJECTION_REJECTED');
    }
  }
}

export function assertFsd3OneShotTrustedLauncherV1(input?: {
  env?: NodeJS.ProcessEnv;
  cliMode?: 'OFFLINE_PLAN' | 'AUTHORIZED_READ_ONLY_PREFLIGHT' | 'EXECUTE';
}): void {
  const env = input?.env ?? process.env;
  assertOperatorAttestationEnvHasNoTestBypassV1(env);
  if (isFsd3TrustedLauncherTestBypassActiveV1()) {
    return;
  }
  if (input?.cliMode === 'OFFLINE_PLAN') {
    return;
  }
  if (env.FSD3_ONE_SHOT_TRUSTED_LAUNCHER !== '1') {
    throw new Error('FSD3_TRUSTED_LAUNCHER_REQUIRED');
  }
  if (!env.FSD3_PRE_NODE_ATTEST_SHA?.trim()) {
    throw new Error('FSD3_PRE_NODE_ATTEST_MISSING');
  }
  assertFsd3NodeRuntimeEnvSanitizedV1(env);
}
