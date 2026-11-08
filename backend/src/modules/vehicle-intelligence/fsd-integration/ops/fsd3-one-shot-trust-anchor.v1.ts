import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  parseFsd3LiveOwnerApprovalTrustStoreJson,
  type Fsd3LiveOwnerApprovalTrustStoreV1,
} from './fsd3-one-shot-owner-approval-trust.v1';

export type Fsd3OwnerApprovalTrustLoadContextV1 =
  | { mode: 'OPERATOR_FILE_ANCHORED' }
  | { mode: 'TEST_ISOLATED_INLINE'; trustStoreJson: string };

const DEFAULT_TRUST_ROOT_PREFIXES = ['/etc/synqdrive', '/var/lib/synqdrive'];

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

function assertTrustFileAnchored(filePath: string, env: NodeJS.ProcessEnv): string {
  const resolved = realpathSync(path.resolve(filePath));
  const allowed = trustRootPrefixes(env).some((prefix) => {
    const normalized = path.resolve(prefix);
    return resolved === normalized || resolved.startsWith(`${normalized}${path.sep}`);
  });
  if (!allowed && env.FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED !== '1') {
    throw new Error('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  }

  const stat = statSync(resolved);
  if (!stat.isFile()) {
    throw new Error('FSD3_L2_TRUST_FILE_INVALID');
  }
  if ((stat.mode & 0o002) !== 0) {
    throw new Error('FSD3_L2_TRUST_FILE_WORLD_WRITABLE');
  }
  if ((stat.mode & 0o020) !== 0 && env.FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED !== '1') {
    throw new Error('FSD3_L2_TRUST_FILE_GROUP_WRITABLE');
  }
  if (env.FSD3_ONE_SHOT_TRUST_REQUIRE_ROOT_OWNER === '1' && stat.uid !== 0) {
    throw new Error('FSD3_L2_TRUST_FILE_NOT_ROOT_OWNED');
  }

  try {
    accessSync(resolved, constants.R_OK);
  } catch {
    throw new Error('FSD3_L2_TRUST_FILE_UNREADABLE');
  }

  if (resolved.includes('..')) {
    throw new Error('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  }

  return resolved;
}

export function loadFsd3LiveOwnerApprovalTrustStoreForContextV1(input: {
  context: Fsd3OwnerApprovalTrustLoadContextV1;
  env?: NodeJS.ProcessEnv;
}): Fsd3LiveOwnerApprovalTrustStoreV1 {
  const env = input.env ?? process.env;
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

  const anchoredPath = assertTrustFileAnchored(file, env);
  return parseFsd3LiveOwnerApprovalTrustStoreJson(readFileSync(anchoredPath, 'utf8'));
}
