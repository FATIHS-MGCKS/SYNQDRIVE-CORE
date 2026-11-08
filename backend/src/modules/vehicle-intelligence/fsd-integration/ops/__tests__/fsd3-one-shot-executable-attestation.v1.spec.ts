import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  assertFsd3ExecutableEntrypointsTrackedAtHeadV1,
  resolveFsd3OneShotExecutableReleaseShaV1,
  resolveSynqDriveRepoRootFromModuleV1,
} from '../fsd3-one-shot-executable-attestation.v1';

describe('Fsd3 executable attestation adversarial', () => {
  const relaxedEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? '/root',
    LANG: process.env.LANG ?? 'C.UTF-8',
    FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED: '1',
  };

  it('rejects untracked entrypoints', () => {
    const root = resolveSynqDriveRepoRootFromModuleV1();
    expect(() =>
      assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
        repoRoot: root,
        entrypointAbsolutePaths: [path.join(root, 'DEFINITELY_NOT_TRACKED_fsd3_cli_xyz.ts')],
      }),
    ).toThrow('FSD3_EXECUTABLE_ENTRYPOINT_UNTRACKED');
  });

  it('resolves HEAD sha under relaxed dev attestation when tree is dirty', () => {
    const sha = resolveFsd3OneShotExecutableReleaseShaV1({ env: relaxedEnv });
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });
});
