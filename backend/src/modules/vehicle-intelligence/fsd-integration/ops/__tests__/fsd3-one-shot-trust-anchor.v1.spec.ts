import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFsd3OneShotTestOwnerSigningMaterialV1 } from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import { loadFsd3LiveOwnerApprovalTrustStoreForContextV1 } from '../fsd3-one-shot-trust-anchor.v1';

describe('Fsd3 trust anchor', () => {
  it('rejects inline operator trust replacement', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: { mode: 'OPERATOR_FILE_ANCHORED' },
        env: {
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON: signing.trustStoreJson,
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_INLINE_OPERATOR_REPLACEMENT_REJECTED');
  });

  it('allows isolated test inline only with explicit test gate', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
        env: {} as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_TEST_INLINE_FORBIDDEN');
    const store = loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
      context: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
      env: { FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE: '1' } as NodeJS.ProcessEnv,
    });
    expect(store.keys.length).toBeGreaterThan(0);
  });

  it('rejects world-writable anchored file', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsd3-trust-'));
    const file = path.join(dir, 'owner-trust.json');
    fs.writeFileSync(file, signing.trustStoreJson);
    fs.chmodSync(file, 0o666);
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: { mode: 'OPERATOR_FILE_ANCHORED' },
        env: {
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: file,
          FSD3_LIVE_OWNER_APPROVAL_TRUST_FILE_ROOT_PREFIXES: dir,
          FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED: '1',
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_FILE_WORLD_WRITABLE');
  });
});
