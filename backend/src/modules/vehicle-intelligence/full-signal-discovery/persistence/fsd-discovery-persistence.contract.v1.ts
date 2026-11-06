import { createHash } from 'node:crypto';

export const FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1 = 'fsd-discovery-run-v1' as const;

export type FsdDiscoveryRunScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
};

export type FsdDiscoveryRunIdentityV1 = FsdDiscoveryRunScopeV1 & {
  runKey: string;
  /** Ignored for replay matching; server allocates on create. */
  runRevision?: number;
  dimoTokenId: number | null;
  connectionIdentityFingerprint: string | null;
};

export function buildFsdDiscoveryRunKey(input: {
  declaredCatalogFingerprint: string;
  contractVersion?: string;
  historicalWindowFingerprint?: string | null;
}): string {
  const contractVersion = input.contractVersion ?? FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1;
  const historical = input.historicalWindowFingerprint ?? '';
  return createHash('sha256')
    .update(`${contractVersion}|${input.declaredCatalogFingerprint}|${historical}`)
    .digest('hex');
}

export function buildFsdDiscoveryStagePlanFingerprint(input: {
  stageType: string;
  planDocumentFingerprints: readonly string[];
}): string {
  const sorted = [...input.planDocumentFingerprints].sort((a, b) => a.localeCompare(b));
  return createHash('sha256')
    .update(`${input.stageType}|${sorted.join('|')}`)
    .digest('hex');
}

export const FSD_DISCOVERY_STAGE_TERMINAL_STATUSES = [
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN_OUTCOME',
  'DEFERRED',
  'SKIPPED',
] as const;

export type FsdDiscoveryWriteAuthorizationV1 = FsdDiscoveryRunScopeV1 & {
  runId: string;
  expectedRunVersion: number;
  leaseOwner: string;
};

export function isFsdDiscoveryStageTerminal(status: string): boolean {
  return (FSD_DISCOVERY_STAGE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function buildFsdDimoConnectionIdentityFingerprint(input: {
  dimoVehicleId: string;
  tokenId: number | null;
}): string {
  return createHash('sha256')
    .update(`dimo|${input.dimoVehicleId}|${input.tokenId ?? ''}`)
    .digest('hex');
}

export const FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES = ['PENDING', 'IN_PROGRESS'] as const;

export const FSD_DISCOVERY_RUN_ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ['IN_PROGRESS', 'INVALIDATED', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'INVALIDATED'],
  COMPLETED: [],
  FAILED: [],
  INVALIDATED: [],
};

export const FSD_DISCOVERY_STAGE_ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PLANNED: ['IN_PROGRESS', 'SKIPPED', 'DEFERRED', 'FAILED'],
  IN_PROGRESS: ['SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME', 'DEFERRED'],
  SUCCEEDED: [],
  FAILED: [],
  UNKNOWN_OUTCOME: [],
  DEFERRED: [],
  SKIPPED: [],
};

export function assertFsdDiscoveryRunTransition(from: string, to: string): void {
  const allowed = FSD_DISCOVERY_RUN_ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`INVALID_STATE_TRANSITION: run ${from} -> ${to}`);
  }
}

export function assertFsdDiscoveryStageTransition(from: string, to: string): void {
  const allowed = FSD_DISCOVERY_STAGE_ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`INVALID_STATE_TRANSITION: stage ${from} -> ${to}`);
  }
}

export class FsdDiscoveryPersistenceError extends Error {
  constructor(
    readonly code:
      | 'STALE_RUN_VERSION'
      | 'STALE_SOURCE_LINK'
      | 'INVALID_STATE_TRANSITION'
      | 'TENANT_SCOPE_VIOLATION'
      | 'RUN_NOT_FOUND'
      | 'STAGE_NOT_FOUND'
      | 'LEASE_LOST'
      | 'SOURCE_LINK_INVALID'
      | 'STAGE_IMMUTABLE'
      | 'PLAN_FINGERPRINT_CONFLICT'
      | 'STAGE_SCOPE_VIOLATION'
      | 'EVIDENCE_SCOPE_VIOLATION'
      | 'RUN_IDENTITY_CONFLICT'
      | 'BUDGET_EXHAUSTED'
      | 'PROVIDER_DISPATCH_BLOCKED'
      | 'RESUME_NOT_SAFE',
    message: string,
  ) {
    super(message);
    this.name = 'FsdDiscoveryPersistenceError';
  }
}
