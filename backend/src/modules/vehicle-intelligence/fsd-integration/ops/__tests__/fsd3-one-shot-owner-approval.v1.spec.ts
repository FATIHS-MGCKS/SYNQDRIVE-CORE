import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2,
  assertFsd3LiveOwnerApprovalMatchesScope,
  parseFsd3LiveOwnerApprovalEnvelopeJson,
  verifyFsd3LiveOwnerApprovalEnvelopeV1,
} from '../fsd3-one-shot-owner-approval.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../fsd3-one-shot-cli-budget.v1';
import {
  createFsd3OneShotTestOwnerSigningMaterialV1,
  signFsd3LiveOwnerApprovalTestEnvelopeV1,
} from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
  discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
  executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
};

function signedEnvelope(overrides: Record<string, unknown> = {}) {
  const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
  process.env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE = '1';
  const payload = {
    schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
    approvalReference: 'owner-l2-signoff-ref-2026-11-08',
    executableReleaseSha: scope.executableReleaseSha,
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    providerSourceLinkId: scope.providerSourceLinkId,
    discoveryRequestKey: scope.discoveryRequestKey,
    liveProvider: 'mock' as const,
    budget: { ...FSD3_P6B_CLI_BUDGET_V1 },
    validFromIso: new Date(Date.now() - 3_600_000).toISOString(),
    validUntilIso: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
  return {
    envelope: signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: signing.privateKey,
      keyId: signing.keyId,
      payload,
    }),
    signing,
  };
}

describe('Fsd3LiveOwnerApproval V1 (signed)', () => {
  it('accepts a valid signed approval', () => {
    const { envelope, signing } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({ approval: verified, scope, liveProvider: 'mock' }),
    ).not.toThrow();
  });

  it('rejects tampered payload after signing', () => {
    const { envelope, signing } = signedEnvelope();
    envelope.payload.approvalReference = 'tampered-reference-value';
    expect(() =>
      verifyFsd3LiveOwnerApprovalEnvelopeV1({
        envelope,
        trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
      }),
    ).toThrow('FSD3_L2_APPROVAL_SIGNATURE_INVALID');
  });

  it('rejects unsigned envelope', () => {
    const { envelope } = signedEnvelope();
    const raw = JSON.stringify({ payload: envelope.payload });
    expect(() => parseFsd3LiveOwnerApprovalEnvelopeJson(raw)).toThrow('FSD3_L2_APPROVAL_UNSIGNED');
  });

  it('rejects budget above P6B cap', () => {
    const { envelope, signing } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    verified.budget.maxRequestsPerRun = 12;
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({ approval: verified, scope, liveProvider: 'mock' }),
    ).toThrow('FSD3_L2_APPROVAL_BUDGET_NOT_AUTHORIZED');
  });

  it('rejects executable SHA mismatch vs attested scope', () => {
    const { envelope, signing } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({
        approval: verified,
        scope: { ...scope, executableReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        liveProvider: 'mock',
      }),
    ).toThrow('FSD3_L2_APPROVAL_EXECUTABLE_SHA_MISMATCH');
  });

  it('rejects live dimo V1 legacy schema', () => {
    const { envelope, signing } = signedEnvelope({ liveProvider: 'dimo_live' });
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({ approval: verified, scope, liveProvider: 'dimo_live' }),
    ).toThrow('FSD3_L2_APPROVAL_LEGACY_LIVE_REJECTED');
  });

  it('rejects V2 actor mismatch', () => {
    const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { envelope, signing } = signedEnvelope({
      schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2,
      actorUserId: actorA,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp-test-v2',
      liveProvider: 'mock',
    });
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({
        approval: verified,
        scope,
        liveProvider: 'mock',
        actorUserId: actorB,
      }),
    ).toThrow('FSD3_L2_APPROVAL_ACTOR_MISMATCH');
  });
});
