import { execFileSync } from 'node:child_process';
import {
  mintFsd3OneShotExecutionCapabilityV1,
  verifyFsd3OneShotExecutionCapabilityV1,
} from '../fsd3-one-shot-execution-capability.v1';
import { resolveFsd3OneShotExecutableReleaseShaV1 } from '../fsd3-one-shot-executable-attestation.v1';

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

  it('binds executable SHA to git HEAD (not user supplied)', () => {
    process.env.FSD3_ONE_SHOT_ALLOW_DIRTY_TREE = '1';
    const head = execFileSync('git', ['-C', '/workspace', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const resolved = resolveFsd3OneShotExecutableReleaseShaV1({ FSD3_ONE_SHOT_ALLOW_DIRTY_TREE: '1', SYNQDRIVE_REPO_ROOT: '/workspace' });
    expect(resolved).toBe(head);
  });
});
