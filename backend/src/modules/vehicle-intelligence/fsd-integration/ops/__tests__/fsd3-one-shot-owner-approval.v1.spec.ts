import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
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
  process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON = signing.trustStoreJson;
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
    validFromIso: '2020-01-01T00:00:00.000Z',
    validUntilIso: '2099-01-01T00:00:00.000Z',
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
    const { envelope } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustStoreJson: process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON,
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({ approval: verified, scope, liveProvider: 'mock' }),
    ).not.toThrow();
  });

  it('rejects tampered payload after signing', () => {
    const { envelope } = signedEnvelope();
    envelope.payload.approvalReference = 'tampered-reference-value';
    expect(() =>
      verifyFsd3LiveOwnerApprovalEnvelopeV1({
        envelope,
        trustStoreJson: process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON,
      }),
    ).toThrow('FSD3_L2_APPROVAL_SIGNATURE_INVALID');
  });

  it('rejects unsigned envelope', () => {
    const { envelope } = signedEnvelope();
    const raw = JSON.stringify({ payload: envelope.payload });
    expect(() => parseFsd3LiveOwnerApprovalEnvelopeJson(raw)).toThrow('FSD3_L2_APPROVAL_UNSIGNED');
  });

  it('rejects budget above P6B cap', () => {
    const { envelope } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustStoreJson: process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON,
    });
    verified.budget.maxRequestsPerRun = 12;
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({ approval: verified, scope, liveProvider: 'mock' }),
    ).toThrow('FSD3_L2_APPROVAL_BUDGET_NOT_AUTHORIZED');
  });

  it('rejects executable SHA mismatch vs attested scope', () => {
    const { envelope } = signedEnvelope();
    const verified = verifyFsd3LiveOwnerApprovalEnvelopeV1({
      envelope,
      trustStoreJson: process.env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON,
    });
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({
        approval: verified,
        scope: { ...scope, executableReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        liveProvider: 'mock',
      }),
    ).toThrow('FSD3_L2_APPROVAL_EXECUTABLE_SHA_MISMATCH');
  });
});
