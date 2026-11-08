import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { stableStringifyFsd3OneShotV1 } from '../fsd3-one-shot-canonical-json.v1';
import { buildFsd3OwnerApprovalSigningDigestV1 } from '../fsd3-one-shot-owner-approval.crypto.v1';
import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  type Fsd3LiveOwnerApprovalSignablePayloadV1,
} from '../fsd3-one-shot-owner-approval.v1';
import { mintFsd3OneShotExecutionCapabilityV1 } from '../fsd3-one-shot-execution-capability.v1';

describe('stableStringifyFsd3OneShotV1', () => {
  it('sorts nested object keys deterministically', () => {
    const a = { z: 1, m: { b: 2, a: 3 }, a: 'x' };
    const b = { a: 'x', m: { a: 3, b: 2 }, z: 1 };
    expect(stableStringifyFsd3OneShotV1(a)).toBe(stableStringifyFsd3OneShotV1(b));
    expect(stableStringifyFsd3OneShotV1(a)).toBe('{"a":"x","m":{"a":3,"b":2},"z":1}');
  });

  it('preserves arrays, null, and finite numbers', () => {
    expect(stableStringifyFsd3OneShotV1([null, 1, 's'])).toBe('[null,1,"s"]');
    expect(stableStringifyFsd3OneShotV1({ n: 0, t: true, f: false })).toBe('{"f":false,"n":0,"t":true}');
  });

  it('omits undefined optional fields', () => {
    expect(stableStringifyFsd3OneShotV1({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => stableStringifyFsd3OneShotV1(undefined)).toThrow('FSD3_CANONICAL_JSON_UNDEFINED');
  });

  it('rejects non-finite numbers and unsupported types', () => {
    expect(() => stableStringifyFsd3OneShotV1(NaN)).toThrow('FSD3_CANONICAL_JSON_NON_FINITE');
    expect(() => stableStringifyFsd3OneShotV1(Infinity)).toThrow('FSD3_CANONICAL_JSON_NON_FINITE');
    expect(() => stableStringifyFsd3OneShotV1(BigInt(1))).toThrow('FSD3_CANONICAL_JSON_UNSUPPORTED');
    expect(() => stableStringifyFsd3OneShotV1(Symbol('x'))).toThrow('FSD3_CANONICAL_JSON_UNSUPPORTED');
  });

  it('produces identical Ed25519 digest for reversed key order payloads', () => {
    const payloadA: Fsd3LiveOwnerApprovalSignablePayloadV1 = {
      schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
      approvalReference: 'canonical-json-test',
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
      organizationId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
      discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
      liveProvider: 'mock',
      budget: {
        maxRequestsPerRun: 2,
        maxSnapshotFieldsPerDocument: 26,
        maxResponseBytes: 524288,
      },
      validFromIso: '2020-01-01T00:00:00.000Z',
      validUntilIso: '2099-01-01T00:00:00.000Z',
    };
    const { privateKey } = generateKeyPairSync('ed25519');
    const digestA = buildFsd3OwnerApprovalSigningDigestV1(payloadA);
    const sig = sign(null, digestA, privateKey).toString('base64');
    const reversedJson = JSON.stringify({
      validUntilIso: payloadA.validUntilIso,
      validFromIso: payloadA.validFromIso,
      budget: payloadA.budget,
      liveProvider: payloadA.liveProvider,
      discoveryRequestKey: payloadA.discoveryRequestKey,
      providerSourceLinkId: payloadA.providerSourceLinkId,
      vehicleId: payloadA.vehicleId,
      organizationId: payloadA.organizationId,
      executableReleaseSha: payloadA.executableReleaseSha,
      approvalReference: payloadA.approvalReference,
      schemaVersion: payloadA.schemaVersion,
    });
    const parsedB = JSON.parse(reversedJson) as Fsd3LiveOwnerApprovalSignablePayloadV1;
    const digestB = buildFsd3OwnerApprovalSigningDigestV1(parsedB);
    expect(digestA.equals(digestB)).toBe(true);
    expect(sign(null, digestB, privateKey).toString('base64')).toBe(sig);
  });

  it('detects tampering via HMAC canonical bytes', () => {
    const secret = Buffer.from('canonical-hmac-secret', 'utf8');
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
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      payload: Record<string, unknown>;
    };
    parsed.payload.organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const tamperedMac = createHmac('sha256', secret)
      .update(stableStringifyFsd3OneShotV1(parsed.payload), 'utf8')
      .digest('base64');
    const tampered = Buffer.from(
      JSON.stringify({ payload: parsed.payload, macBase64: tamperedMac }),
      'utf8',
    ).toString('base64url');
    expect(tampered).not.toBe(token);
  });
});
