import {
  mintFsd3OneShotExecutionCapabilityV1,
  verifyFsd3OneShotExecutionCapabilityV1,
} from '../fsd3-one-shot-execution-capability.v1';
import {
  resolveFsd3OneShotExecutableReleaseShaV1,
  resolveSynqDriveRepoRootFromModuleV1,
} from '../fsd3-one-shot-executable-attestation.v1';
import { __setFsd3AttestationTestPolicyForJestV1 } from '../fsd3-one-shot-attestation-test-policy.v1';
import { execFileSync } from 'node:child_process';
import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  assertFsd3LiveOwnerApprovalMatchesScope,
  verifyFsd3LiveOwnerApprovalEnvelopeV1,
} from '../fsd3-one-shot-owner-approval.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../fsd3-one-shot-cli-budget.v1';
import {
  createFsd3OneShotTestOwnerSigningMaterialV1,
  signFsd3LiveOwnerApprovalTestEnvelopeV1,
} from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import { Fsd3OneShotPreflightService } from '../fsd3-one-shot-preflight.service';
import { Fsd3OneShotCapabilityService } from '../fsd3-one-shot-capability.service';

describe('Fsd3 one-shot security primitives', () => {
  it('rejects forged execution capability MAC', () => {
    const secret = Buffer.from('capability-test-secret', 'utf8');
    const token = mintFsd3OneShotExecutionCapabilityV1({
      secret,
      payload: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        vehicleId: '22222222-2222-4222-8222-222222222222',
        providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
        discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
        attestedExecutableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
        approvalReference: 'ref',
        liveProvider: 'mock',
        actorUserId: '55555555-5555-4555-8555-555555555555',
        operatorAuthorizationReference: 'op-ref',
        dimoVehicleId: '66666666-6666-4666-8666-666666666666',
        dimoTokenId: 12345,
        connectionIdentityFingerprint: 'fp',
      },
    });
    expect(() =>
      verifyFsd3OneShotExecutionCapabilityV1({ token, secret: Buffer.from('wrong-secret', 'utf8') }),
    ).toThrow('FSD3_EXECUTION_CAPABILITY_FORGED');
    expect(() => verifyFsd3OneShotExecutionCapabilityV1({ token, secret })).not.toThrow();
  });

  it('binds executable SHA to module-derived git HEAD when worktree has no tracked diffs', () => {
    const root = resolveSynqDriveRepoRootFromModuleV1();
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME ?? '/root',
      LANG: process.env.LANG ?? 'C.UTF-8',
    };
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const porcelain = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim();
    const strictEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME ?? '/root',
      LANG: process.env.LANG ?? 'C.UTF-8',
    };
    if (porcelain.length > 0) {
      expect(() => resolveFsd3OneShotExecutableReleaseShaV1({ env: strictEnv })).toThrow(/FSD3_EXECUTABLE_/);
      __setFsd3AttestationTestPolicyForJestV1('RELAXED_WORKTREE_ONLY');
      expect(resolveFsd3OneShotExecutableReleaseShaV1({ env })).toBe(head);
      __setFsd3AttestationTestPolicyForJestV1(null);
      return;
    }
    expect(resolveFsd3OneShotExecutableReleaseShaV1()).toBe(head);
  });

  it('rejects spoofed repo root substitution on operator attestation', () => {
    expect(() =>
      resolveFsd3OneShotExecutableReleaseShaV1({
        env: { SYNQDRIVE_REPO_ROOT: '/tmp/not-synqdrive' } as NodeJS.ProcessEnv,
      }),
    ).toThrow('FSD3_EXECUTABLE_ROOT_SUBSTITUTION_REJECTED');
  });

  it('rejects capability mint without verified envelope and preflight ticket', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    process.env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE = '1';
    const scope = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
      discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
    };
    const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: signing.privateKey,
      keyId: signing.keyId,
      payload: {
        schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
        approvalReference: 'ref-cap-bypass',
        executableReleaseSha: scope.executableReleaseSha,
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        providerSourceLinkId: scope.providerSourceLinkId,
        discoveryRequestKey: scope.discoveryRequestKey,
        liveProvider: 'mock',
        budget: { ...FSD3_P6B_CLI_BUDGET_V1 },
        validFromIso: new Date(Date.now() - 60_000).toISOString(),
        validUntilIso: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    const preflightSvc = new Fsd3OneShotPreflightService(
      {} as never,
      {} as never,
      {} as never,
      new Fsd3OneShotCapabilityService(),
    );
    preflightSvc.onModuleInit();
    expect(() =>
      preflightSvc.issueExecutionCapability({
        scope,
        verifiedOwnerApprovalEnvelope: envelope,
        preflightTicket: 'not-a-valid-ticket',
        actorUserId: '55555555-5555-4555-8555-555555555555',
        liveProvider: 'mock',
      }),
    ).toThrow();
    expect(() =>
      assertFsd3LiveOwnerApprovalMatchesScope({
        approval: verifyFsd3LiveOwnerApprovalEnvelopeV1({
          envelope,
          trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
        }),
        scope: { ...scope, vehicleId: randomUUID() },
        liveProvider: 'mock',
      }),
    ).toThrow('FSD3_L2_APPROVAL_VEHICLE_MISMATCH');
  });
});

function randomUUID(): string {
  return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
}
