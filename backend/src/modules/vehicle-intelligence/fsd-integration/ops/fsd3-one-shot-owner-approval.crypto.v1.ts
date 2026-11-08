import { createHash, verify, type KeyObject } from 'node:crypto';
import { stableStringifyFsd3OneShotV1 } from './fsd3-one-shot-canonical-json.v1';
import type { Fsd3LiveOwnerApprovalSignablePayloadV1 } from './fsd3-one-shot-owner-approval.v1';

export function buildFsd3OwnerApprovalSigningDigestV1(payload: Fsd3LiveOwnerApprovalSignablePayloadV1): Buffer {
  return createHash('sha256').update(stableStringifyFsd3OneShotV1(payload), 'utf8').digest();
}

export function verifyFsd3OwnerApprovalEd25519SignatureV1(input: {
  publicKey: KeyObject;
  payload: Fsd3LiveOwnerApprovalSignablePayloadV1;
  detachedBase64: string;
}): void {
  const detached = Buffer.from(input.detachedBase64, 'base64');
  if (detached.length !== 64) {
    throw new Error('FSD3_L2_APPROVAL_SIGNATURE_MALFORMED');
  }
  const digest = buildFsd3OwnerApprovalSigningDigestV1(input.payload);
  const ok = verify(null, digest, input.publicKey, detached);
  if (!ok) {
    throw new Error('FSD3_L2_APPROVAL_SIGNATURE_INVALID');
  }
}
