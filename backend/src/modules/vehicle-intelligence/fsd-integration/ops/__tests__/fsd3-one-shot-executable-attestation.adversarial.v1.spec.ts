import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertFsd3ExecutableEntrypointsTrackedAtHeadV1,
  resolveFsd3OneShotExecutableReleaseShaV1,
  resolveSynqDriveRepoRootFromModuleV1,
} from '../fsd3-one-shot-executable-attestation.v1';
import { assertFsd3NodeRuntimeEnvSanitizedV1 } from '../fsd3-one-shot-runtime-launch-guard.v1';

function cleanAttestationEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? '/root',
    LANG: process.env.LANG ?? 'C.UTF-8',
  };
}

function withDisposableClone(fn: (root: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsd3-attest-'));
  const sourceRepo = resolveSynqDriveRepoRootFromModuleV1();
  try {
    execFileSync('git', ['clone', '-q', sourceRepo, dir]);
    execFileSync('git', ['-C', dir, 'checkout', '-q', 'HEAD']);
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Fsd3 executable attestation adversarial (disposable clone)', () => {
  jest.setTimeout(240_000);
  const relModule =
    'backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-execution.service.ts';

  it('rejects skip-worktree tampering', () => {
    withDisposableClone((root) => {
      const abs = path.join(root, relModule);
      execFileSync('git', ['-C', root, 'update-index', '--skip-worktree', relModule]);
      fs.appendFileSync(abs, '\n// ATTEST_TAMPER\n');
      expect(() =>
        resolveFsd3OneShotExecutableReleaseShaV1({
          repoRoot: root,
          env: cleanAttestationEnv(),
          entrypointAbsolutePaths: [abs],
        }),
      ).toThrow(/FSD3_EXECUTABLE_INDEX_FLAG_SPOOFED|FSD3_EXECUTABLE_SOURCE_CONTENT_MISMATCH|FSD3_EXECUTABLE_ENTRYPOINT_DIRTY/);
    });
  });

  it('rejects assume-unchanged tampering', () => {
    withDisposableClone((root) => {
      const abs = path.join(root, relModule);
      execFileSync('git', ['-C', root, 'update-index', '--assume-unchanged', relModule]);
      fs.appendFileSync(abs, '\n// ATTEST_TAMPER\n');
      expect(() =>
        assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
          repoRoot: root,
          entrypointAbsolutePaths: [abs],
        }),
      ).toThrow(/FSD3_EXECUTABLE_INDEX_FLAG_SPOOFED|FSD3_EXECUTABLE_ENTRYPOINT_DIRTY|FSD3_EXECUTABLE_SOURCE_CONTENT_MISMATCH/);
    });
  });

  it('accepts trusted clean release', () => {
    withDisposableClone((root) => {
      const abs = path.join(root, relModule);
      const sha = resolveFsd3OneShotExecutableReleaseShaV1({
        repoRoot: root,
        env: cleanAttestationEnv(),
        entrypointAbsolutePaths: [abs],
      });
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });
});

describe('Fsd3 pre-node poison module', () => {
  jest.setTimeout(240_000);
  const relModule =
    'backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-execution.service.ts';

  it('pre-node attestation fails before poison top-level side effect can run via tsx', () => {
    withDisposableClone((root) => {
      const abs = path.join(root, relModule);
      fs.appendFileSync(abs, '\nglobalThis.__FSD3_POISONED = true;\n');
      const nodeBin = fs.existsSync('/usr/bin/node') ? '/usr/bin/node' : 'node';
      const preAttest = path.join(root, 'backend/scripts/ops/fsd3-one-shot-pre-node-attest.mjs');
      let exitCode = 0;
      try {
        execFileSync(nodeBin, [preAttest, root], {
          env: { HOME: process.env.HOME ?? '/root', LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
        });
      } catch (err) {
        exitCode = (err as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
      expect((globalThis as { __FSD3_POISONED?: boolean }).__FSD3_POISONED).toBeUndefined();
    });
  });
});

describe('Fsd3 runtime launch guard', () => {
  it('rejects NODE_OPTIONS preload', () => {
    expect(() =>
      assertFsd3NodeRuntimeEnvSanitizedV1({
        ...process.env,
        NODE_OPTIONS: '--require /tmp/evil.js',
      }),
    ).toThrow('FSD3_NODE_RUNTIME_ENV_REJECTED');
  });

  it('rejects GIT_DIR injection in Node env', () => {
    expect(() =>
      assertFsd3NodeRuntimeEnvSanitizedV1({
        GIT_DIR: '/tmp/fake',
      }),
    ).toThrow('FSD3_GIT_ENV_INJECTION_REJECTED');
  });
});
