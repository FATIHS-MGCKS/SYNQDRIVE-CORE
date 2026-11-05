import { createHash } from 'node:crypto';

export const FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1 = 'fsd-discovery-run-v1' as const;

export type FsdDiscoveryRunScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
};

export type FsdDiscoveryRunIdentityV1 = FsdDiscoveryRunScopeV1 & {
  runKey: string;
  runRevision: number;
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
      | 'STAGE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'FsdDiscoveryPersistenceError';
  }
}
