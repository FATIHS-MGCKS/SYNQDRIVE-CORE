import { lstatSync, realpathSync, statSync, type PathLike, type Stats } from 'node:fs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFsd3OneShotTestOwnerSigningMaterialV1 } from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import {
  __setFsd3TrustAnchorFsDepsForTestsV1,
  loadFsd3LiveOwnerApprovalTrustStoreForContextV1,
  type Fsd3TrustAnchorFsDepsV1,
} from '../fsd3-one-shot-trust-anchor.v1';

const liveContext = { mode: 'OPERATOR_FILE_ANCHORED' as const, liveDimoExecute: true };

function mockStat(partial: {
  isFile?: () => boolean;
  isSymbolicLink?: () => boolean;
  uid: number;
  mode: number;
}): Stats {
  return {
    isFile: () => partial.isFile?.() ?? true,
    isSymbolicLink: () => partial.isSymbolicLink?.() ?? false,
    uid: partial.uid,
    mode: partial.mode,
  } as Stats;
}

function injectedFs(overrides: Partial<Fsd3TrustAnchorFsDepsV1>): Fsd3TrustAnchorFsDepsV1 {
  const base: Fsd3TrustAnchorFsDepsV1 = {
    lstatSync: ((_p: PathLike) =>
      mockStat({ uid: 0, mode: 0o755, isSymbolicLink: () => false })) as unknown as typeof lstatSync,
    statSync: ((_p: PathLike) =>
      mockStat({ uid: 0, mode: 0o644, isFile: () => true })) as unknown as typeof statSync,
    realpathSync: ((p: PathLike) => (typeof p === 'string' ? p : String(p))) as unknown as typeof realpathSync,
    accessSync: () => undefined,
    readTrustFileUtf8: () => '{}',
  };
  return { ...base, ...overrides };
}

describe('Fsd3 live trust anchor matrix (injected fs)', () => {
  afterEach(() => {
    __setFsd3TrustAnchorFsDepsForTestsV1(null);
  });

  it('rejects non-root-owned trust file on live path', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const file = path.join('/etc/synqdrive/owner-trust-matrix-test.json');
    __setFsd3TrustAnchorFsDepsForTestsV1(
      injectedFs({
        statSync: (() => mockStat({ uid: 501, mode: 0o644, isFile: () => true })) as unknown as typeof statSync,
        readTrustFileUtf8: () => signing.trustStoreJson,
      }),
    );
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: { FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: file } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_FILE_NOT_ROOT_OWNED');
  });

  it('rejects group-writable trust file on live path', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const file = path.join('/var/lib/synqdrive/owner-trust-matrix-test.json');
    __setFsd3TrustAnchorFsDepsForTestsV1(
      injectedFs({
        statSync: (() => mockStat({ uid: 0, mode: 0o660, isFile: () => true })) as unknown as typeof statSync,
        readTrustFileUtf8: () => signing.trustStoreJson,
      }),
    );
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: { FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: file } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_FILE_WRITABLE');
  });

  it('rejects symlink escape on trust path', () => {
    const file = path.join(os.tmpdir(), 'owner-trust-symlink.json');
    __setFsd3TrustAnchorFsDepsForTestsV1(
      injectedFs({
        lstatSync: (() =>
          mockStat({ uid: 0, mode: 0o644, isSymbolicLink: () => true })) as unknown as typeof lstatSync,
      }),
    );
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: { FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: file } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_SYMLINK_ESCAPE');
  });
});
