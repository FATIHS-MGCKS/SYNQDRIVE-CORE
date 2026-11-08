import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isUnderFsd3ExecutableAttestationBoundaryV1 } from './fsd3-one-shot-executable-attestation-boundary.v1';
import {
  assertGitEnvironmentNotInjectedV1,
  resolveTrustedGitExecutableV1,
  trustedGitExecFileSyncV1,
} from './fsd3-one-shot-trusted-git.v1';

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

function gitPath(): string {
  return resolveTrustedGitExecutableV1();
}

function git(root: string, ...args: string[]): string {
  return trustedGitExecFileSyncV1(gitPath(), ['-C', root, ...args], { encoding: 'utf8' }) as string;
}

function assertNoIndexSpoofFlags(root: string): void {
  const listing = git(root, 'ls-files', '-v');
  for (const line of listing.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const flag = line[0];
    const rel = line.slice(2).trim();
    if (!isUnderFsd3ExecutableAttestationBoundaryV1(rel)) {
      continue;
    }
    if (flag === 'S' || flag === 'h' || flag === 's') {
      throw new Error('FSD3_EXECUTABLE_INDEX_FLAG_SPOOFED');
    }
  }
}

function assertGitWorkTreeClean(root: string): void {
  const porcelain = git(root, 'status', '--porcelain')
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
  const toplevel = git(root, 'rev-parse', '--show-toplevel').trim();
  if (path.resolve(toplevel) !== path.resolve(root)) {
    throw new Error('FSD3_EXECUTABLE_ROOT_SPOOFED');
  }
}

function assertReleaseRootNotOperatorWritable(root: string): void {
  const st = fs.statSync(root);
  if (st.isSymbolicLink()) {
    throw new Error('FSD3_EXECUTABLE_RELEASE_SYMLINK');
  }
  if ((st.mode & 0o002) !== 0) {
    throw new Error('FSD3_EXECUTABLE_RELEASE_WORLD_WRITABLE');
  }
  const backendSrc = path.join(root, 'backend', 'src');
  if (fs.existsSync(backendSrc)) {
    const bst = fs.statSync(backendSrc);
    if ((bst.mode & 0o022) !== 0) {
      throw new Error('FSD3_EXECUTABLE_RELEASE_TREE_WRITABLE');
    }
  }
}

function listBoundaryPathsAtHead(root: string, head: string): string[] {
  const tree = git(root, 'ls-tree', '-r', '--name-only', head);
  return tree
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((rel) => rel.length > 0 && isUnderFsd3ExecutableAttestationBoundaryV1(rel));
}

function readHeadBlobSha(root: string, head: string, relPath: string): string {
  const out = git(root, 'ls-tree', head, '--', relPath).trim();
  if (!out) {
    throw new Error('FSD3_EXECUTABLE_SOURCE_NOT_AT_HEAD');
  }
  const tabIdx = out.indexOf('\t');
  const meta = tabIdx >= 0 ? out.slice(0, tabIdx) : out;
  const parts = meta.split(/\s+/);
  const sha = parts[2];
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('FSD3_EXECUTABLE_SOURCE_NOT_AT_HEAD');
  }
  return sha;
}

function assertBoundarySourcesMatchHeadBlobs(root: string, head: string): void {
  const paths = listBoundaryPathsAtHead(root, head);
  const gitBin = gitPath();
  for (const rel of paths) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      throw new Error('FSD3_EXECUTABLE_SOURCE_MISSING_ON_DISK');
    }
    const diskBytes = fs.readFileSync(abs);
    const expectedSha = readHeadBlobSha(root, head, rel);
    const blob = trustedGitExecFileSyncV1(gitBin, ['-C', root, 'cat-file', 'blob', expectedSha], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    }) as Buffer;
    const diskSha = createHash('sha1')
      .update(`blob ${diskBytes.length}\0`)
      .update(diskBytes)
      .digest('hex');
    if (diskSha !== expectedSha) {
      throw new Error('FSD3_EXECUTABLE_SOURCE_CONTENT_MISMATCH');
    }
    if (!diskBytes.equals(blob)) {
      throw new Error('FSD3_EXECUTABLE_SOURCE_CONTENT_MISMATCH');
    }
  }
}

export function assertFsd3ExecutableEntrypointsTrackedAtHeadV1(input: {
  repoRoot: string;
  entrypointAbsolutePaths: string[];
  head?: string;
}): void {
  const head =
    input.head ??
    (git(input.repoRoot, 'rev-parse', 'HEAD').trim() as string);
  assertNoIndexSpoofFlags(input.repoRoot);
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
      trustedGitExecFileSyncV1(gitPath(), ['-C', input.repoRoot, 'ls-files', '--error-unmatch', '--', rel], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      throw new Error('FSD3_EXECUTABLE_ENTRYPOINT_UNTRACKED');
    }
    const expectedSha = readHeadBlobSha(input.repoRoot, head, rel);
    const diskBytes = fs.readFileSync(abs);
    const blob = trustedGitExecFileSyncV1(gitPath(), ['-C', input.repoRoot, 'cat-file', 'blob', expectedSha], {
      encoding: 'buffer',
    }) as Buffer;
    if (!diskBytes.equals(blob)) {
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
  skipBoundaryBlobCompare?: boolean;
  /** Disposable-clone adversarial tests only — never set from operator CLIs. */
  repoRoot?: string;
}): string {
  const mode = input?.mode ?? 'OPERATOR';
  const env = input?.env ?? process.env;
  assertGitEnvironmentNotInjectedV1(env);
  const canonicalRoot = resolveSynqDriveRepoRootFromModuleV1();
  const root = input?.repoRoot ? path.resolve(input.repoRoot) : canonicalRoot;

  if (mode === 'OPERATOR' && !input?.repoRoot) {
    const substituted = env.SYNQDRIVE_REPO_ROOT?.trim();
    if (substituted && path.resolve(substituted) !== path.resolve(canonicalRoot)) {
      throw new Error('FSD3_EXECUTABLE_ROOT_SUBSTITUTION_REJECTED');
    }
  }
  let head: string;
  try {
    head = git(root, 'rev-parse', 'HEAD').trim();
  } catch {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }
  if (!SHA40.test(head)) {
    throw new Error('FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
  }

  const relaxed = env.FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED === '1';

  try {
    assertGitTopLevelMatchesRoot(root);
    if (!relaxed) {
      assertNoIndexSpoofFlags(root);
      assertGitWorkTreeClean(root);
      if (mode === 'OPERATOR' && !input?.repoRoot) {
        assertReleaseRootNotOperatorWritable(root);
      }
      if (!input?.skipBoundaryBlobCompare) {
        assertBoundarySourcesMatchHeadBlobs(root, head);
      }
    }
    if (input?.entrypointAbsolutePaths?.length) {
      assertFsd3ExecutableEntrypointsTrackedAtHeadV1({
        repoRoot: root,
        entrypointAbsolutePaths: input.entrypointAbsolutePaths,
        head,
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
