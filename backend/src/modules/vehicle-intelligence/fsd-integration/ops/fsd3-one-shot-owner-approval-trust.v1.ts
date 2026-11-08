import { createPublicKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1 = 'FSD3_LIVE_OWNER_APPROVAL_TRUST_V1' as const;

export type Fsd3LiveOwnerApprovalTrustKeyV1 = {
  keyId: string;
  publicKeySpkiBase64: string;
  notBeforeIso?: string;
  notAfterIso?: string;
};

export type Fsd3LiveOwnerApprovalTrustStoreV1 = {
  schemaVersion: typeof FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1;
  keys: Fsd3LiveOwnerApprovalTrustKeyV1[];
  revokedKeyIds: string[];
};

export function parseFsd3LiveOwnerApprovalTrustStoreJson(raw: string): Fsd3LiveOwnerApprovalTrustStoreV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('FSD3_L2_TRUST_INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FSD3_L2_TRUST_SCHEMA_INVALID');
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1) {
    throw new Error('FSD3_L2_TRUST_SCHEMA_INVALID');
  }
  if (!Array.isArray(o.keys) || o.keys.length === 0) {
    throw new Error('FSD3_L2_TRUST_NO_KEYS');
  }
  const revokedKeyIds = Array.isArray(o.revokedKeyIds)
    ? o.revokedKeyIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const keys: Fsd3LiveOwnerApprovalTrustKeyV1[] = [];
  for (const entry of o.keys) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('FSD3_L2_TRUST_SCHEMA_INVALID');
    }
    const e = entry as Record<string, unknown>;
    const keyId = e.keyId;
    const publicKeySpkiBase64 = e.publicKeySpkiBase64;
    if (typeof keyId !== 'string' || !keyId.trim() || typeof publicKeySpkiBase64 !== 'string' || !publicKeySpkiBase64.trim()) {
      throw new Error('FSD3_L2_TRUST_SCHEMA_INVALID');
    }
    keys.push({
      keyId: keyId.trim(),
      publicKeySpkiBase64: publicKeySpkiBase64.trim(),
      notBeforeIso: typeof e.notBeforeIso === 'string' ? e.notBeforeIso : undefined,
      notAfterIso: typeof e.notAfterIso === 'string' ? e.notAfterIso : undefined,
    });
  }
  return { schemaVersion: FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1, keys, revokedKeyIds };
}

export function loadFsd3LiveOwnerApprovalTrustStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Fsd3LiveOwnerApprovalTrustStoreV1 {
  const inline = env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON?.trim();
  const file = env.FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE?.trim();
  if (inline) {
    return parseFsd3LiveOwnerApprovalTrustStoreJson(inline);
  }
  if (file) {
    return parseFsd3LiveOwnerApprovalTrustStoreJson(readFileSync(file, 'utf8'));
  }
  throw new Error('FSD3_L2_TRUST_STORE_MISSING');
}

export function resolveFsd3OwnerApprovalTrustPublicKeyV1(input: {
  store: Fsd3LiveOwnerApprovalTrustStoreV1;
  keyId: string;
  now?: Date;
}): KeyObject {
  const now = input.now ?? new Date();
  if (input.store.revokedKeyIds.includes(input.keyId)) {
    throw new Error('FSD3_L2_TRUST_KEY_REVOKED');
  }
  const entry = input.store.keys.find((k) => k.keyId === input.keyId);
  if (!entry) {
    throw new Error('FSD3_L2_TRUST_KEY_UNKNOWN');
  }
  if (entry.notBeforeIso) {
    const from = new Date(entry.notBeforeIso);
    if (!Number.isNaN(from.getTime()) && now < from) {
      throw new Error('FSD3_L2_TRUST_KEY_NOT_YET_VALID');
    }
  }
  if (entry.notAfterIso) {
    const until = new Date(entry.notAfterIso);
    if (!Number.isNaN(until.getTime()) && now > until) {
      throw new Error('FSD3_L2_TRUST_KEY_EXPIRED');
    }
  }
  try {
    const der = Buffer.from(entry.publicKeySpkiBase64, 'base64');
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('FSD3_L2_TRUST_KEY_NOT_ED25519');
    }
    return key;
  } catch {
    throw new Error('FSD3_L2_TRUST_KEY_MALFORMED');
  }
}
