import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  assertFsd3LiveOwnerApprovalMatchesScope,
  parseFsd3LiveOwnerApprovalJson,
} from '../fsd3-one-shot-owner-approval.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../fsd3-one-shot-cli-budget.v1';

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
  discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
  executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
};

function validDoc(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
    approvalReference: 'owner-l2-signoff-ref-2026-11-08',
    executableReleaseSha: scope.executableReleaseSha,
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    providerSourceLinkId: scope.providerSourceLinkId,
    discoveryRequestKey: scope.discoveryRequestKey,
    budget: { ...FSD3_P6B_CLI_BUDGET_V1 },
    validFromIso: '2020-01-01T00:00:00.000Z',
    validUntilIso: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Fsd3LiveOwnerApproval V1', () => {
  it('accepts a matching scope and budget cap', () => {
    const approval = parseFsd3LiveOwnerApprovalJson(JSON.stringify(validDoc()));
    expect(() => assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope })).not.toThrow();
  });

  it('rejects budget above P6B cap', () => {
    const approval = parseFsd3LiveOwnerApprovalJson(
      JSON.stringify(validDoc({ budget: { ...FSD3_P6B_CLI_BUDGET_V1, maxRequestsPerRun: 12 } })),
    );
    expect(() => assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope })).toThrow(
      'FSD3_L2_APPROVAL_BUDGET_NOT_AUTHORIZED',
    );
  });

  it('rejects executable SHA mismatch', () => {
    const approval = parseFsd3LiveOwnerApprovalJson(
      JSON.stringify(validDoc({ executableReleaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })),
    );
    expect(() => assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope })).toThrow(
      'FSD3_L2_APPROVAL_EXECUTABLE_SHA_MISMATCH',
    );
  });

  it('rejects expired window', () => {
    const approval = parseFsd3LiveOwnerApprovalJson(
      JSON.stringify(
        validDoc({
          validFromIso: '2010-01-01T00:00:00.000Z',
          validUntilIso: '2010-02-01T00:00:00.000Z',
        }),
      ),
    );
    expect(() => assertFsd3LiveOwnerApprovalMatchesScope({ approval, scope })).toThrow(
      'FSD3_L2_APPROVAL_WINDOW_EXPIRED',
    );
  });
});
