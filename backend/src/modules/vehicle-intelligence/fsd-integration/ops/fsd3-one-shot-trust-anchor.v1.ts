import { accessSync, closeSync, constants, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  parseFsd3LiveOwnerApprovalTrustStoreJson,
  type Fsd3LiveOwnerApprovalTrustStoreV1,
} from './fsd3-one-shot-owner-approval-trust.v1';

export type Fsd3OwnerApprovalTrustLoadContextV1 =
  | { mode: 'OPERATOR_FILE_ANCHORED'; liveDimoExecute?: boolean }
  | { mode: 'TEST_ISOLATED_INLINE'; trustStoreJson: string };

const LIVE_TRUST_ROOT_PREFIXES = ['/etc/synqdrive', '/var/lib/synqdrive'].map((entry) => path.resolve(entry));

const DEFAULT_TRUST_ROOT_PREFIXES = LIVE_TRUST_ROOT_PREFIXES;

export type Fsd3TrustAnchorFsDepsV1 = {
  lstatSync: typeof lstatSync;
  statSync: typeof statSync;
  realpathSync: typeof realpathSync;
  accessSync: typeof accessSync;
  readTrustFileUtf8: (resolvedPath: string) => string;
};

const defaultFsDeps: Fsd3TrustAnchorFsDepsV1 = {
  lstatSync,
  statSync,
  realpathSync,
  accessSync,
  readTrustFileUtf8: (resolvedPath: string) => readTrustFileUtf8SameFdV1(resolvedPath),
};

let trustAnchorFsDeps: Fsd3TrustAnchorFsDepsV1 = defaultFsDeps;

/** Test-only: production CLI cannot reach this without importing the test bundle. */
export function __setFsd3TrustAnchorFsDepsForTestsV1(deps: Fsd3TrustAnchorFsDepsV1 | null): void {
  trustAnchorFsDeps = deps ?? defaultFsDeps;
}

function readTrustFileUtf8SameFdV1(resolvedPath: string): string {
  const fd = openSync(resolvedPath, constants.O_RDONLY);
  try {
    const st = statSync(resolvedPath);
    if (!st.isFile()) {
      throw new Error('FSD3_L2_TRUST_FILE_INVALID');
    }
    const buf = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < st.size) {
      const n = readSync(fd, buf, offset, st.size - offset, null);
      if (n <= 0) {
        break;
      }
      offset += n;
    }
    return buf.toString('utf8', 0, offset);
  } finally {
    closeSync(fd);
  }
}

function trustRootPrefixes(env: NodeJS.ProcessEnv): string[] {
  const raw = env.FSD3_LIVE_OWNER_APPROVAL_TRUST_FILE_ROOT_PREFIXES?.trim();
  if (!raw) {
    return DEFAULT_TRUST_ROOT_PREFIXES;
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => path.resolve(part));
}

function assertLiveDimoTrustEnvFailsClosed(env: NodeJS.ProcessEnv): void {
  if (env.FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED?.trim()) {
    throw new Error('FSD3_L2_TRUST_LIVE_RELAXED_FORBIDDEN');
  }
  if (env.FSD3_LIVE_OWNER_APPROVAL_TRUST_FILE_ROOT_PREFIXES?.trim()) {
    throw new Error('FSD3_L2_TRUST_LIVE_PREFIX_OVERRIDE_REJECTED');
  }
  if (env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE === '1') {
    throw new Error('FSD3_L2_TRUST_LIVE_TEST_INLINE_FORBIDDEN');
  }
  if (env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON?.trim()) {
    throw new Error('FSD3_L2_TRUST_INLINE_OPERATOR_REPLACEMENT_REJECTED');
  }
}

function assertParentDirectoryTrustChain(resolvedFile: string, allowedRoots: string[]): void {
  const anchorRoot = allowedRoots.find(
    (root) => resolvedFile === root || resolvedFile.startsWith(`${root}${path.sep}`),
  );
  if (!anchorRoot) {
    throw new Error('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  }

  let dir = path.dirname(resolvedFile);
  while (true) {
    const st = trustAnchorFsDeps.lstatSync(dir);
    if (st.isSymbolicLink()) {
      throw new Error('FSD3_L2_TRUST_SYMLINK_ESCAPE');
    }
    if (st.uid !== 0) {
      throw new Error('FSD3_L2_TRUST_PARENT_NOT_ROOT_OWNED');
    }
    if ((st.mode & 0o022) !== 0) {
      throw new Error('FSD3_L2_TRUST_PARENT_WRITABLE');
    }
    if (dir === anchorRoot) {
      break;
    }
  const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

function assertTrustFileAnchored(filePath: string, env: NodeJS.ProcessEnv, liveDimoExecute: boolean): string {
  if (liveDimoExecute) {
    assertLiveDimoTrustEnvFailsClosed(env);
  }

  const rawPath = path.resolve(filePath);
  const rawLstat = trustAnchorFsDeps.lstatSync(rawPath);
  if (rawLstat.isSymbolicLink()) {
    throw new Error('FSD3_L2_TRUST_SYMLINK_ESCAPE');
  }

  const resolved = trustAnchorFsDeps.realpathSync(rawPath);
  const allowedRoots = liveDimoExecute ? LIVE_TRUST_ROOT_PREFIXES : trustRootPrefixes(env);
  const allowed = allowedRoots.some((prefix) => {
    return resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`);
  });
  if (!allowed && (!liveDimoExecute && env.FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED !== '1')) {
    throw new Error('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  }
  if (!allowed && liveDimoExecute) {
    throw new Error('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  }

  const stat = trustAnchorFsDeps.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error('FSD3_L2_TRUST_FILE_INVALID');
  }
  if ((stat.mode & 0o002) !== 0) {
    throw new Error('FSD3_L2_TRUST_FILE_WORLD_WRITABLE');
  }
  if (liveDimoExecute) {
    if (stat.uid !== 0) {
      throw new Error('FSD3_L2_TRUST_FILE_NOT_ROOT_OWNED');
    }
    if ((stat.mode & 0o022) !== 0) {
      throw new Error('FSD3_L2_TRUST_FILE_WRITABLE');
    }
    assertParentDirectoryTrustChain(resolved, LIVE_TRUST_ROOT_PREFIXES);
  } else if ((stat.mode & 0o020) !== 0 && env.FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED !== '1') {
    throw new Error('FSD3_L2_TRUST_FILE_GROUP_WRITABLE');
  } else if (env.FSD3_ONE_SHOT_TRUST_REQUIRE_ROOT_OWNER === '1' && stat.uid !== 0) {
    throw new Error('FSD3_L2_TRUST_FILE_NOT_ROOT_OWNED');
  }

  try {
    trustAnchorFsDeps.accessSync(resolved, constants.R_OK);
  } catch {
    throw new Error('FSD3_L2_TRUST_FILE_UNREADABLE');
  }

  return resolved;
}

export function loadFsd3LiveOwnerApprovalTrustStoreForContextV1(input: {
  context: Fsd3OwnerApprovalTrustLoadContextV1;
  env?: NodeJS.ProcessEnv;
}): Fsd3LiveOwnerApprovalTrustStoreV1 {
  const env = input.env ?? process.env;
  const liveDimoExecute =
    input.context.mode === 'OPERATOR_FILE_ANCHORED' && input.context.liveDimoExecute === true;

  if (liveDimoExecute) {
    assertLiveDimoTrustEnvFailsClosed(env);
  }

  if (input.context.mode === 'TEST_ISOLATED_INLINE') {
    if (env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE !== '1') {
      throw new Error('FSD3_L2_TRUST_TEST_INLINE_FORBIDDEN');
    }
    return parseFsd3LiveOwnerApprovalTrustStoreJson(input.context.trustStoreJson);
  }

  const inline = env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON?.trim();
  if (inline) {
    throw new Error('FSD3_L2_TRUST_INLINE_OPERATOR_REPLACEMENT_REJECTED');
  }

  const file = env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE?.trim();
  if (!file) {
    throw new Error('FSD3_L2_TRUST_STORE_MISSING');
  }

  const anchoredPath = assertTrustFileAnchored(file, env, liveDimoExecute);
  return parseFsd3LiveOwnerApprovalTrustStoreJson(trustAnchorFsDeps.readTrustFileUtf8(anchoredPath));
}
