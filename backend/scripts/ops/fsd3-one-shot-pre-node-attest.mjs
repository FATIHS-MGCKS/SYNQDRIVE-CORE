#!/usr/bin/env node
/**
 * Pre-Node attestation — Node stdlib only; runs before tsx loads application modules.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHA40 = /^[a-f0-9]{40}$/;

function die(code, message) {
  console.error(message);
  process.exit(code);
}

for (const key of Object.keys(process.env)) {
  if (key === 'GIT_EXEC_PATH' || key.startsWith('GIT_')) {
    die(44, 'FSD3_GIT_ENV_INJECTION_REJECTED');
  }
}

const repoRoot = process.argv[2]?.trim();
if (!repoRoot) {
  die(2, 'FSD3_PRE_NODE_REPO_ROOT_REQUIRED');
}

const GIT_BIN = fs.existsSync('/usr/bin/git') ? '/usr/bin/git' : '/bin/git';
if (!fs.existsSync(GIT_BIN)) {
  die(43, 'FSD3_TRUSTED_GIT_MISSING');
}

const gitEnv = { HOME: process.env.HOME ?? '/root', LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' };

function git(...args) {
  const full = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', repoRoot, ...args];
  return execFileSync(GIT_BIN, full, { encoding: 'utf8', env: gitEnv, maxBuffer: 64 * 1024 * 1024 });
}

function gitBuffer(...args) {
  const full = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', repoRoot, ...args];
  return execFileSync(GIT_BIN, full, { env: gitEnv, maxBuffer: 64 * 1024 * 1024 });
}

const manifestPath = path.join(repoRoot, 'backend/scripts/ops/fsd3-one-shot-attestation-boundary.manifest.json');
if (!fs.existsSync(manifestPath)) {
  die(45, 'FSD3_ATTESTATION_MANIFEST_MISSING');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const prefixes = manifest.pathPrefixes ?? [];
const protectedArtifacts = manifest.protectedLaunchArtifacts ?? [];

const SOURCE_SUFFIX = /\.(ts|tsx|mjs|cjs)$/;

function underBoundary(rel) {
  if (!SOURCE_SUFFIX.test(rel)) return false;
  return prefixes.some((p) => rel === p || rel.startsWith(p));
}

let head;
try {
  head = git('rev-parse', 'HEAD').trim();
} catch {
  die(46, 'FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
}
if (!SHA40.test(head)) {
  die(46, 'FSD3_EXECUTABLE_SHA_UNVERIFIABLE');
}

const toplevel = git('rev-parse', '--show-toplevel').trim();
if (path.resolve(toplevel) !== path.resolve(repoRoot)) {
  die(47, 'FSD3_EXECUTABLE_ROOT_SPOOFED');
}

const launcherPath = process.env.FSD3_LAUNCHER_SCRIPT_PATH?.trim();
if (launcherPath) {
  const lst = fs.lstatSync(launcherPath);
  if (lst.isSymbolicLink()) {
    die(48, 'FSD3_LAUNCHER_SYMLINK_REJECTED');
  }
  if ((lst.mode & 0o022) !== 0) {
    die(49, 'FSD3_LAUNCHER_OPERATOR_WRITABLE');
  }
}

const rootStat = fs.statSync(repoRoot);
if (rootStat.isSymbolicLink()) {
  die(50, 'FSD3_EXECUTABLE_RELEASE_SYMLINK');
}
if ((rootStat.mode & 0o002) !== 0) {
  die(51, 'FSD3_EXECUTABLE_RELEASE_WORLD_WRITABLE');
}
const backendSrc = path.join(repoRoot, 'backend', 'src');
if (fs.existsSync(backendSrc)) {
  const bst = fs.statSync(backendSrc);
  if ((bst.mode & 0o022) !== 0) {
    die(52, 'FSD3_EXECUTABLE_RELEASE_TREE_WRITABLE');
  }
}

const porcelain = git('status', '--porcelain')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
const SOURCE_PATH = /^(backend|frontend)\/.*\.(ts|tsx|js|mjs|cjs)$/;
const SOURCE_PREFIX = /^(backend\/src|backend\/scripts|frontend\/src)\//;
for (const line of porcelain) {
  const pathEntry = line.slice(3).trim();
  if (line.startsWith('?? ')) {
    if (SOURCE_PATH.test(pathEntry) || SOURCE_PREFIX.test(pathEntry)) {
      die(53, 'FSD3_EXECUTABLE_TREE_DIRTY');
    }
    continue;
  }
  die(53, 'FSD3_EXECUTABLE_TREE_DIRTY');
}

const listing = git('ls-files', '-v');
for (const line of listing.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const flag = line[0];
  const rel = line.slice(2).trim();
  if (!underBoundary(rel)) continue;
  if (flag === 'S' || flag === 'h' || flag === 's') {
    die(54, 'FSD3_EXECUTABLE_INDEX_FLAG_SPOOFED');
  }
}

function blobSha(rel) {
  const out = git('ls-tree', head, '--', rel).trim();
  if (!out) die(55, 'FSD3_EXECUTABLE_SOURCE_NOT_AT_HEAD');
  const parts = out.split(/\s+/);
  return parts[2];
}

const tree = git('ls-tree', '-r', '--name-only', head);
const boundaryPaths = tree
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((rel) => rel && underBoundary(rel));

for (const rel of boundaryPaths) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) die(56, 'FSD3_EXECUTABLE_SOURCE_MISSING_ON_DISK');
  const disk = fs.readFileSync(abs);
  const expectedSha = blobSha(rel);
  const blob = gitBuffer('cat-file', 'blob', expectedSha);
  if (!disk.equals(blob)) {
    die(57, 'FSD3_EXECUTABLE_SOURCE_CONTENT_MISMATCH');
  }
}

for (const rel of protectedArtifacts) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) die(58, 'FSD3_EXECUTABLE_LAUNCH_ARTIFACT_MISSING');
  const disk = fs.readFileSync(abs);
  const expectedSha = blobSha(rel);
  const blob = gitBuffer('cat-file', 'blob', expectedSha);
  if (!disk.equals(blob)) {
    die(59, 'FSD3_EXECUTABLE_LAUNCH_ARTIFACT_DIRTY');
  }
}

console.log(`FSD3_PRE_NODE_ATTEST_SHA=${head}`);
