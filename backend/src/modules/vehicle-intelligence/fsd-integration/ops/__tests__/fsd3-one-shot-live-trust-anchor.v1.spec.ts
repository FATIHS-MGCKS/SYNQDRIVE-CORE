import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFsd3OneShotTestOwnerSigningMaterialV1 } from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import { loadFsd3LiveOwnerApprovalTrustStoreForContextV1 } from '../fsd3-one-shot-trust-anchor.v1';
import { FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1, verifyFsd3LiveOwnerApprovalEnvelopeV1 } from '../fsd3-one-shot-owner-approval.v1';
import { signFsd3LiveOwnerApprovalTestEnvelopeV1 } from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../fsd3-one-shot-cli-budget.v1';
import { generateKeyPairSync } from 'node:crypto';

const liveContext = { mode: 'OPERATOR_FILE_ANCHORED' as const, liveDimoExecute: true };

describe('Fsd3 live dimo trust anchor (adversarial)', () => {
  it('rejects relaxed trust flag for live', () => {
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: {
          FSD3_ONE_SHOT_TRUST_ANCHOR_RELAXED: '1',
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: '/etc/synqdrive/owner-trust.json',
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_LIVE_RELAXED_FORBIDDEN');
  });

  it('rejects custom root prefix override for live', () => {
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: {
          FSD3_LIVE_OWNER_APPROVAL_TRUST_FILE_ROOT_PREFIXES: '/tmp/evil',
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: '/etc/synqdrive/owner-trust.json',
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_LIVE_PREFIX_OVERRIDE_REJECTED');
  });

  it('rejects test inline flag for live even when trust context is operator file', () => {
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: {
          FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE: '1',
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON: '{}',
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: '/etc/synqdrive/owner-trust.json',
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_LIVE_TEST_INLINE_FORBIDDEN');
  });

  it('rejects untrusted public key not in anchored store', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const rogue = generateKeyPairSync('ed25519');
    const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: rogue.privateKey,
      keyId: 'rogue-key',
      payload: {
        schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
        approvalReference: 'rogue-approval',
        executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
        organizationId: '11111111-1111-4111-8111-111111111111',
        vehicleId: '22222222-2222-4222-8222-222222222222',
        providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
        discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
        liveProvider: 'dimo_live',
        budget: { ...FSD3_P6B_CLI_BUDGET_V1 },
        validFromIso: '2020-01-01T00:00:00.000Z',
        validUntilIso: '2099-01-01T00:00:00.000Z',
      },
    });
    expect(() =>
      verifyFsd3LiveOwnerApprovalEnvelopeV1({
        envelope,
        trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
      }),
    ).toThrow();
  });

  it('rejects non-root-owned trust file for live when file exists under tmp prefix override path', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsd3-live-trust-'));
    const file = path.join(dir, 'owner-trust.json');
    fs.writeFileSync(file, signing.trustStoreJson);
    fs.chmodSync(file, 0o444);
    expect(() =>
      loadFsd3LiveOwnerApprovalTrustStoreForContextV1({
        context: liveContext,
        env: {
          FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE: file,
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_L2_TRUST_PATH_NOT_ANCHORED');
  });
});
