import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const SHA40 = /^[a-f0-9]{40}$/;

function repoRootFromBackend(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}

/**
 * Independently resolves the git commit for the checked-out SynqDrive tree (fail-closed on dirty/unverifiable).
 */
export function resolveFsd3OneShotExecutableReleaseShaV1(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SYNQDRIVE_REPO_ROOT?.trim() || repoRootFromBackend();
  let head: string;
  try {
    head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }
  if (!SHA40.test(head)) {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }

  const allowDirty = env.FSD3_ONE_SHOT_ALLOW_DIRTY_TREE === '1';
  if (!allowDirty) {
    try {
      const porcelain = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
      if (porcelain.length > 0) {
        throw new Error('FSD3_EXECUTABLE_TREE_DIRTY');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'FSD3_EXECUTABLE_TREE_DIRTY') {
        throw err;
      }
      throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
    }
  }

  return head;
}
