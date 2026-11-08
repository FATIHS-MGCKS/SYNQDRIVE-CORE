import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1,
  type Fsd3LiveOwnerApprovalTrustStoreV1,
} from '../fsd3-one-shot-owner-approval-trust.v1';
import { buildFsd3OwnerApprovalSigningDigestV1 } from '../fsd3-one-shot-owner-approval.crypto.v1';
import type {
  Fsd3LiveOwnerApprovalEnvelopeV1,
  Fsd3LiveOwnerApprovalSignablePayloadV1,
} from '../fsd3-one-shot-owner-approval.v1';

export const FSD3_ONE_SHOT_TEST_OWNER_KEY_ID_V1 = 'fsd3-owner-l2-ci-v1' as const;

export function createFsd3OneShotTestOwnerSigningMaterialV1(): {
  privateKey: KeyObject;
  trustStoreJson: string;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const store: Fsd3LiveOwnerApprovalTrustStoreV1 = {
    schemaVersion: FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1,
    keys: [{ keyId: FSD3_ONE_SHOT_TEST_OWNER_KEY_ID_V1, publicKeySpkiBase64: spki }],
    revokedKeyIds: [],
  };
  return {
    privateKey,
    trustStoreJson: JSON.stringify(store),
    keyId: FSD3_ONE_SHOT_TEST_OWNER_KEY_ID_V1,
  };
}

export function signFsd3LiveOwnerApprovalTestEnvelopeV1(input: {
  privateKey: KeyObject;
  keyId: string;
  payload: Fsd3LiveOwnerApprovalSignablePayloadV1;
}): Fsd3LiveOwnerApprovalEnvelopeV1 {
  const digest = buildFsd3OwnerApprovalSigningDigestV1(input.payload);
  const detached = sign(null, digest, input.privateKey);
  return {
    payload: input.payload,
    signature: {
      algorithm: 'Ed25519',
      keyId: input.keyId,
      detachedBase64: detached.toString('base64'),
    },
  };
}
