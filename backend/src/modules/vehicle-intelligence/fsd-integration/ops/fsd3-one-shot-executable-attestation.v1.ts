import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHA40 = /^[a-f0-9]{40}$/;

export type Fsd3ExecutableAttestationModeV1 = 'OFFLINE_PLAN' | 'OPERATOR';

/** Canonical SynqDrive repo root derived from this module (not operator-supplied). */
export function resolveSynqDriveRepoRootFromModuleV1(): string {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('FSD3_EXECUTABLE_ROOT_UNVERIFIABLE');
}

const SOURCE_PATH =
  /^(backend|frontend)\/.*\.(ts|tsx|js|mjs|cjs)$/;
const SOURCE_PREFIX = /^(backend\/src|backend\/scripts|frontend\/src)\//;

function assertGitWorkTreeClean(root: string): void {
  const porcelain = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of porcelain) {
    const pathEntry = line.slice(3).trim();
    if (line.startsWith('?? ')) {
      if (SOURCE_PATH.test(pathEntry) || SOURCE_PREFIX.test(pathEntry)) {
        throw new Error('FSD3_EXECUTABLE_TREE_DIRTY');
      }
      continue;
    }
    throw new Error('FSD3_EXECUTABLE_TREE_DIRTY');
  }
}

function assertGitTopLevelMatchesRoot(root: string): void {
  const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (path.resolve(toplevel) !== path.resolve(root)) {
    throw new Error('FSD3_EXECUTABLE_ROOT_SPOOFED');
  }
}

export function assertFsd3ExecutableEntrypointsTrackedAtHeadV1(input: {
  repoRoot: string;
  entrypointAbsolutePaths: string[];
}): void {
  for (const entry of input.entrypointAbsolutePaths) {
    const candidate = path.resolve(entry);
    if (!fs.existsSync(candidate)) {
      throw new Error('FSD3_EXECUTABLE_ENTRYPOINT_UNTRACKED');
    }
    const abs = fs.realpathSync(candidate);
    const rel = path.relative(input.repoRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('FSD3_EXECUTABLE_ENTRYPOINT_OUTSIDE_REPO');
    }
    try {
      execFileSync('git', ['-C', input.repoRoot, 'ls-files', '--error-unmatch', '--', rel], {
        stdio: 'pipe',
      });
    } catch {
      throw new Error('FSD3_EXECUTABLE_ENTRYPOINT_UNTRACKED');
    }
    const diff = execFileSync('git', ['-C', input.repoRoot, 'diff', '--name-only', 'HEAD', '--', rel], {
      encoding: 'utf8',
    }).trim();
    if (diff.length > 0) {
      throw new Error('FSD3_EXECUTABLE_ENTRYPOINT_DIRTY');
    }
  }
}

/**
 * Independently resolves HEAD for the checked-out SynqDrive tree.
 * OPERATOR mode: ignores SYNQDRIVE_REPO_ROOT substitution; always uses module-derived root; requires clean tree.
 */
export function resolveFsd3OneShotExecutableReleaseShaV1(input?: {
  mode?: Fsd3ExecutableAttestationModeV1;
  env?: NodeJS.ProcessEnv;
  entrypointAbsolutePaths?: string[];
}): string {
  const mode = input?.mode ?? 'OPERATOR';
  const env = input?.env ?? process.env;
  const canonicalRoot = resolveSynqDriveRepoRootFromModuleV1();

  if (mode === 'OPERATOR') {
    const substituted = env.SYNQDRIVE_REPO_ROOT?.trim();
    if (substituted && path.resolve(substituted) !== path.resolve(canonicalRoot)) {
      throw new Error('FSD3_EXECUTABLE_ROOT_SUBSTITUTION_REJECTED');
    }
  }

  const root = canonicalRoot;
  let head: string;
  try {
    head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }
  if (!SHA40.test(head)) {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }

  try {
    assertGitTopLevelMatchesRoot(root);
    assertGitWorkTreeClean(root);
    if (input?.entrypointAbsolutePaths?.length) {
      assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
        repoRoot: root,
        entrypointAbsolutePaths: input.entrypointAbsolutePaths,
      });
    }
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }

  return head;
}
