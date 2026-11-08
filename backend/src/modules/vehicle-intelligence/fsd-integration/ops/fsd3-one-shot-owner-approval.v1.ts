import {
  FSD3_P6B_CLI_BUDGET_V1,
  assertBudgetMatchesP6bCliCap,
} from './fsd3-one-shot-cli-budget.v1';
import {
  normalizeFsdBudgetConfigV1,
  type FsdBudgetConfigV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';

export const FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1 = 'FSD3_LIVE_OWNER_APPROVAL_V1' as const;

const SHA40 = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Fsd3LiveOwnerApprovalDocumentV1 = {
  schemaVersion: typeof FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1;
  approvalReference: string;
  executableReleaseSha: string;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  budget: {
    maxRequestsPerRun: number;
    maxSnapshotFieldsPerDocument: number;
    maxResponseBytes: number;
    maxHistoricalWindowSeconds?: number;
    maxHistoricalFloatFieldsPerChunk?: number;
  };
  validFromIso: string;
  validUntilIso: string;
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

function expectBudget(obj: Record<string, unknown>): Fsd3LiveOwnerApprovalDocumentV1['budget'] {
  const raw = obj.budget;
  if (!raw || typeof raw !== 'object') {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const b = raw as Record<string, unknown>;
  const nums = ['maxRequestsPerRun', 'maxSnapshotFieldsPerDocument', 'maxResponseBytes'] as const;
  const out: Fsd3LiveOwnerApprovalDocumentV1['budget'] = {
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

export function parseFsd3LiveOwnerApprovalJson(raw: string): Fsd3LiveOwnerApprovalDocumentV1 {
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
  if (o.schemaVersion !== FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const approvalReference = expectString(o, 'approvalReference');
  if (approvalReference.length < 8 || approvalReference.length > 256) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const executableReleaseSha = expectString(o, 'executableReleaseSha');
  if (!SHA40.test(executableReleaseSha)) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const organizationId = expectString(o, 'organizationId');
  const vehicleId = expectString(o, 'vehicleId');
  const providerSourceLinkId = expectString(o, 'providerSourceLinkId');
  const discoveryRequestKey = expectString(o, 'discoveryRequestKey');
  for (const id of [organizationId, vehicleId, providerSourceLinkId, discoveryRequestKey]) {
    if (!UUID.test(id)) {
      throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
    }
  }
  const validFromIso = expectString(o, 'validFromIso');
  const validUntilIso = expectString(o, 'validUntilIso');
  return {
    schemaVersion: FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
    approvalReference,
    executableReleaseSha,
    organizationId,
    vehicleId,
    providerSourceLinkId,
    discoveryRequestKey,
    budget: expectBudget(o),
    validFromIso,
    validUntilIso,
  };
}

export function assertFsd3LiveOwnerApprovalMatchesScope(input: {
  approval: Fsd3LiveOwnerApprovalDocumentV1;
  scope: Fsd3OneShotCliScopeV1;
  now?: Date;
}): void {
  const now = input.now ?? new Date();
  const a = input.approval;
  const s = input.scope;
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
  if (now < from || now > until) {
    throw new Error('FSD3_L2_APPROVAL_WINDOW_EXPIRED');
  }
}
