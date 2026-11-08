import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  assertFsd3ExecutableEntrypointsTrackedAtHeadV1,
  resolveSynqDriveRepoRootFromModuleV1,
} from '../fsd3-one-shot-executable-attestation.v1';

describe('Fsd3 executable attestation adversarial', () => {
  it('rejects untracked entrypoints', () => {
    const root = resolveSynqDriveRepoRootFromModuleV1();
    expect(() =>
      assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
        repoRoot: root,
        entrypointAbsolutePaths: [path.join(root, 'DEFINITELY_NOT_TRACKED_fsd3_cli_xyz.ts')],
      }),
    ).toThrow('FSD3_EXECUTABLE_ENTRYPOINT_UNTRACKED');
  });

  it('binds tracked one-shot ops module when worktree is clean at HEAD', () => {
    const root = resolveSynqDriveRepoRootFromModuleV1();
    const modulePath = path.join(
      root,
      'backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-executable-attestation.v1.ts',
    );
    const porcelain = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    const relModule = path.relative(root, modulePath);
    const entryDiff = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD', '--', relModule], {
      encoding: 'utf8',
    }).trim();
    if (porcelain.length > 0 && entryDiff.length > 0) {
      expect(() =>
        assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
          repoRoot: root,
          entrypointAbsolutePaths: [modulePath],
        }),
      ).toThrow('FSD3_EXECUTABLE_ENTRYPOINT_DIRTY');
      return;
    }
    if (porcelain.length > 0 && entryDiff.length === 0) {
      return;
    }
    expect(() =>
      assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
        repoRoot: root,
        entrypointAbsolutePaths: [modulePath],
      }),
    ).not.toThrow();
  });
});
