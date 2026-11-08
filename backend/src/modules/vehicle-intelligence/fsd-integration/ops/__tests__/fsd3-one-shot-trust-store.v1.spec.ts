import { parseFsd3LiveOwnerApprovalTrustStoreJson } from '../fsd3-one-shot-owner-approval-trust.v1';
import { FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1 } from '../fsd3-one-shot-owner-approval-trust.v1';
import { createFsd3OneShotTestOwnerSigningMaterialV1 } from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';

describe('Fsd3 owner approval trust store', () => {
  it('rejects duplicate key IDs', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const store = JSON.parse(signing.trustStoreJson) as {
      schemaVersion: string;
      keys: { keyId: string; publicKeySpkiBase64: string }[];
      revokedKeyIds: string[];
    };
    store.keys.push({ ...store.keys[0] });
    expect(() => parseFsd3LiveOwnerApprovalTrustStoreJson(JSON.stringify(store))).toThrow(
      'FSD3_L2_TRUST_DUPLICATE_KEY_ID',
    );
  });

  it('rejects invalid key validity window', () => {
    const signing = createFsd3OneShotTestOwnerSigningMaterialV1();
    const store = {
      schemaVersion: FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1,
      keys: [
        {
          keyId: signing.keyId,
          publicKeySpkiBase64: JSON.parse(signing.trustStoreJson).keys[0].publicKeySpkiBase64,
          notBeforeIso: '2099-01-01T00:00:00.000Z',
          notAfterIso: '2000-01-01T00:00:00.000Z',
        },
      ],
      revokedKeyIds: [],
    };
    expect(() => parseFsd3LiveOwnerApprovalTrustStoreJson(JSON.stringify(store))).toThrow(
      'FSD3_L2_TRUST_KEY_WINDOW_INVALID',
    );
  });
});
