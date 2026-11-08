import {
  FSD3_P6B_CLI_BUDGET_V1,
  assertBudgetMatchesP6bCliCap,
} from './fsd3-one-shot-cli-budget.v1';
import {
  normalizeFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import {
  loadFsd3LiveOwnerApprovalTrustStoreForContextV1,
  type Fsd3OwnerApprovalTrustLoadContextV1,
} from './fsd3-one-shot-trust-anchor.v1';
import { verifyFsd3OwnerApprovalEd25519SignatureV1 } from './fsd3-one-shot-owner-approval.crypto.v1';
import { resolveFsd3OwnerApprovalTrustPublicKeyV1 } from './fsd3-one-shot-owner-approval-trust.v1';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-execution-capability.v1';

export const FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1 = 'FSD3_LIVE_OWNER_APPROVAL_V1' as const;
export const FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2 = 'FSD3_LIVE_OWNER_APPROVAL_V2' as const;

const SHA40 = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRICT_UTC_ISO_Z =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const MAX_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Fsd3LiveOwnerApprovalSignablePayloadV1 = {
  schemaVersion:
    | typeof FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1
    | typeof FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2;
  approvalReference: string;
  executableReleaseSha: string;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  liveProvider: Fsd3OneShotLiveProviderV1;
  budget: {
    maxRequestsPerRun: number;
    maxSnapshotFieldsPerDocument: number;
    maxResponseBytes: number;
    maxHistoricalWindowSeconds?: number;
    maxHistoricalFloatFieldsPerChunk?: number;
  };
  validFromIso: string;
  validUntilIso: string;
  actorUserId?: string;
  dimoTokenId?: number;
  connectionIdentityFingerprint?: string;
};

export type Fsd3LiveOwnerApprovalDocumentV1 = Fsd3LiveOwnerApprovalSignablePayloadV1;

export type Fsd3LiveOwnerApprovalEnvelopeV1 = {
  payload: Fsd3LiveOwnerApprovalSignablePayloadV1;
  signature: {
    algorithm: 'Ed25519';
    keyId: string;
    detachedBase64: string;
  };
};

export type Fsd3OneShotCliScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  executableReleaseSha: string;
};

function expectString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  return v.trim();
}

function expectBudget(obj: Record<string, unknown>): Fsd3LiveOwnerApprovalSignablePayloadV1['budget'] {
  const raw = obj.budget;
  if (!raw || typeof raw !== 'object') {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const b = raw as Record<string, unknown>;
  const nums = ['maxRequestsPerRun', 'maxSnapshotFieldsPerDocument', 'maxResponseBytes'] as const;
  const out: Fsd3LiveOwnerApprovalSignablePayloadV1['budget'] = {
    maxRequestsPerRun: 0,
    maxSnapshotFieldsPerDocument: 0,
    maxResponseBytes: 0,
  };
  for (const k of nums) {
    if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
    out[k] = Math.floor(b[k] as number);
  }
  if (typeof b.maxHistoricalWindowSeconds === 'number') {
    out.maxHistoricalWindowSeconds = Math.floor(b.maxHistoricalWindowSeconds);
  }
  if (typeof b.maxHistoricalFloatFieldsPerChunk === 'number') {
    out.maxHistoricalFloatFieldsPerChunk = Math.floor(b.maxHistoricalFloatFieldsPerChunk);
  }
  return out;
}

function parseStrictUtcIsoZ(value: string): string {
  if (!STRICT_UTC_ISO_Z.test(value)) {
    throw new Error('FSD3_L2_APPROVAL_WINDOW_INVALID');
  }
  return value;
}

function parseSignablePayload(raw: Record<string, unknown>): Fsd3LiveOwnerApprovalSignablePayloadV1 {
  if (
    raw.schemaVersion !== FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1 &&
    raw.schemaVersion !== FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2
  ) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const isV2 = raw.schemaVersion === FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2;
  const approvalReference = expectString(raw, 'approvalReference');
  if (approvalReference.length < 8 || approvalReference.length > 256) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const executableReleaseSha = expectString(raw, 'executableReleaseSha');
  if (!SHA40.test(executableReleaseSha)) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const organizationId = expectString(raw, 'organizationId');
  const vehicleId = expectString(raw, 'vehicleId');
  const providerSourceLinkId = expectString(raw, 'providerSourceLinkId');
  const discoveryRequestKey = expectString(raw, 'discoveryRequestKey');
  for (const id of [organizationId, vehicleId, providerSourceLinkId, discoveryRequestKey]) {
    if (!UUID.test(id)) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
  }
  const liveProvider = expectString(raw, 'liveProvider');
  if (liveProvider !== 'mock' && liveProvider !== 'dimo_live') {
    throw new Error('FSD3_L2_APPROVAL_LIVE_PROVIDER_INVALID');
  }
  let actorUserId: string | undefined;
  let dimoTokenId: number | undefined;
  let connectionIdentityFingerprint: string | undefined;
  if (isV2) {
    actorUserId = expectString(raw, 'actorUserId');
    if (!UUID.test(actorUserId)) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
    if (typeof raw.dimoTokenId !== 'number' || !Number.isFinite(raw.dimoTokenId)) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
    dimoTokenId = Math.floor(raw.dimoTokenId);
    connectionIdentityFingerprint = expectString(raw, 'connectionIdentityFingerprint');
    if (connectionIdentityFingerprint.length < 8) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
  }

  return {
    schemaVersion: raw.schemaVersion as Fsd3LiveOwnerApprovalSignablePayloadV1['schemaVersion'],
    approvalReference,
    executableReleaseSha,
    organizationId,
    vehicleId,
    providerSourceLinkId,
    discoveryRequestKey,
    liveProvider,
    budget: expectBudget(raw),
    validFromIso: parseStrictUtcIsoZ(expectString(raw, 'validFromIso')),
    validUntilIso: parseStrictUtcIsoZ(expectString(raw, 'validUntilIso')),
    actorUserId,
    dimoTokenId,
    connectionIdentityFingerprint,
  };
}

export function parseFsd3LiveOwnerApprovalEnvelopeJson(raw: string): Fsd3LiveOwnerApprovalEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('FSD3_L2_APPROVAL_INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const o = parsed as Record<string, unknown>;
  if (!o.payload || typeof o.payload !== 'object') {
    throw new Error('FSD3_L2_APPROVAL_UNSIGNED');
  }
  if (!o.signature || typeof o.signature !== 'object') {
    throw new Error('FSD3_L2_APPROVAL_UNSIGNED');
  }
  const sig = o.signature as Record<string, unknown>;
  if (sig.algorithm !== 'Ed25519') {
    throw new Error('FSD3_L2_APPROVAL_SIGNATURE_MALFORMED');
  }
  const keyId = expectString(sig, 'keyId');
  const detachedBase64 = expectString(sig, 'detachedBase64');
  const payload = parseSignablePayload(o.payload as Record<string, unknown>);
  return {
    payload,
    signature: { algorithm: 'Ed25519', keyId, detachedBase64 },
  };
}

/** @deprecated Use parseFsd3LiveOwnerApprovalEnvelopeJson — kept for legacy unit imports. */
export function parseFsd3LiveOwnerApprovalJson(raw: string): Fsd3LiveOwnerApprovalDocumentV1 {
  return parseFsd3LiveOwnerApprovalEnvelopeJson(raw).payload;
}

export function verifyFsd3LiveOwnerApprovalEnvelopeV1(input: {
  envelope: Fsd3LiveOwnerApprovalEnvelopeV1;
  trustContext?: Fsd3OwnerApprovalTrustLoadContextV1;
  /** @deprecated Use trustContext TEST_ISOLATED_INLINE */
  trustStoreJson?: string;
  now?: Date;
}): Fsd3LiveOwnerApprovalDocumentV1 {
  const trustContext: Fsd3OwnerApprovalTrustLoadContextV1 = input.trustContext
    ? input.trustContext
  : input.trustStoreJson
    ? { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: input.trustStoreJson }
    : { mode: 'OPERATOR_FILE_ANCHORED' };
  const store = loadFsd3LiveOwnerApprovalTrustStoreForContextV1({ context: trustContext });
  const publicKey = resolveFsd3OwnerApprovalTrustPublicKeyV1({
    store,
    keyId: input.envelope.signature.keyId,
    now: input.now,
  });
  verifyFsd3OwnerApprovalEd25519SignatureV1({
    publicKey,
    payload: input.envelope.payload,
    detachedBase64: input.envelope.signature.detachedBase64,
  });
  return input.envelope.payload;
}

export function verifyFsd3LiveOwnerApprovalFileV1(input: {
  raw: string;
  trustStoreJson?: string;
  now?: Date;
}): Fsd3LiveOwnerApprovalDocumentV1 {
  const envelope = parseFsd3LiveOwnerApprovalEnvelopeJson(input.raw);
  return verifyFsd3LiveOwnerApprovalEnvelopeV1({
    envelope,
    trustStoreJson: input.trustStoreJson,
    now: input.now,
  });
}

export function assertFsd3LiveOwnerApprovalMatchesScope(input: {
  approval: Fsd3LiveOwnerApprovalDocumentV1;
  scope: Fsd3OneShotCliScopeV1;
  liveProvider: Fsd3OneShotLiveProviderV1;
  actorUserId?: string;
  connectionIdentityFingerprint?: string;
  dimoTokenId?: number;
  now?: Date;
}): void {
  const now = input.now ?? new Date();
  const a = input.approval;
  const s = input.scope;
  if (input.liveProvider === 'dimo_live' && a.schemaVersion === FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1) {
    throw new Error('FSD3_L2_APPROVAL_LEGACY_LIVE_REJECTED');
  }
  if (a.schemaVersion === FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2) {
    if (!a.actorUserId || a.dimoTokenId == null || !a.connectionIdentityFingerprint) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
    if (input.actorUserId && input.actorUserId !== a.actorUserId) {
      throw new Error('FSD3_L2_APPROVAL_ACTOR_MISMATCH');
    }
    if (input.dimoTokenId != null && input.dimoTokenId !== a.dimoTokenId) {
      throw new Error('FSD3_L2_APPROVAL_TOKEN_MISMATCH');
    }
    if (
      input.connectionIdentityFingerprint &&
      input.connectionIdentityFingerprint !== a.connectionIdentityFingerprint
    ) {
      throw new Error('FSD3_L2_APPROVAL_IDENTITY_FINGERPRINT_MISMATCH');
    }
  }
  if (a.liveProvider !== input.liveProvider) {
    throw new Error('FSD3_L2_APPROVAL_LIVE_PROVIDER_MISMATCH');
  }
  if (a.organizationId !== s.organizationId) {
    throw new Error('FSD3_L2_APPROVAL_ORG_MISMATCH');
  }
  if (a.vehicleId !== s.vehicleId) {
    throw new Error('FSD3_L2_APPROVAL_VEHICLE_MISMATCH');
  }
  if (a.providerSourceLinkId !== s.providerSourceLinkId) {
    throw new Error('FSD3_L2_APPROVAL_LINK_MISMATCH');
  }
  if (a.discoveryRequestKey !== s.discoveryRequestKey) {
    throw new Error('FSD3_L2_APPROVAL_REQUEST_IDENTITY_MISMATCH');
  }
  if (a.executableReleaseSha !== s.executableReleaseSha) {
    throw new Error('FSD3_L2_APPROVAL_EXECUTABLE_SHA_MISMATCH');
  }
  const budget: FsdBudgetConfigV1 = normalizeFsdBudgetConfigV1({
    maxRequestsPerRun: a.budget.maxRequestsPerRun,
    maxSnapshotFieldsPerDocument: a.budget.maxSnapshotFieldsPerDocument,
    maxResponseBytes: a.budget.maxResponseBytes,
    maxHistoricalWindowSeconds: a.budget.maxHistoricalWindowSeconds ?? 3600,
    maxHistoricalFloatFieldsPerChunk: a.budget.maxHistoricalFloatFieldsPerChunk ?? 8,
  });
  try {
    assertBudgetMatchesP6bCliCap(budget);
  } catch {
    throw new Error('FSD3_L2_APPROVAL_BUDGET_NOT_AUTHORIZED');
  }
  if (budget.maxRequestsPerRun !== FSD3_P6B_CLI_BUDGET_V1.maxRequestsPerRun) {
    throw new Error('FSD3_L2_APPROVAL_BUDGET_NOT_AUTHORIZED');
  }
  const from = new Date(a.validFromIso);
  const until = new Date(a.validUntilIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from) {
    throw new Error('FSD3_L2_APPROVAL_WINDOW_INVALID');
  }
  if (until.getTime() - from.getTime() > MAX_APPROVAL_WINDOW_MS) {
    throw new Error('FSD3_L2_APPROVAL_WINDOW_INVALID');
  }
  if (now < from || now > until) {
    throw new Error('FSD3_L2_APPROVAL_WINDOW_EXPIRED');
  }
}
