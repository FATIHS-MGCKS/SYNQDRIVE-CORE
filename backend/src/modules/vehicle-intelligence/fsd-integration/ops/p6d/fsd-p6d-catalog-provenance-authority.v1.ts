import type { Fsd3CatalogStageCheckpointV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { FSD3_CATALOG_ATTEMPT_KEY_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { hasPersistedFsdCatalogFetchV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd-catalog-persist.util.v1';
import { buildFsd3DeclaredCatalogFingerprintV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-fingerprint.v1';
import { parseFsd2DisposableDatabaseNameV1 } from './fsd-p6d-production-database-target.v1';

export type FsdP6dAuthoritativeCatalogProvenanceV1 =
  | { class: 'LIVE_DIMO_VERIFIED' }
  | { class: 'INTEGRATION_MOCK_DISPOSABLE' };

export type FsdP6dPersistedCatalogRunContextV1 = {
  runId: string;
  runKey: string;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoTokenId: number;
  connectionIdentityFingerprint: string;
  invalidatedAt: Date | null;
  checkpoint: Fsd3CatalogStageCheckpointV1;
  stageHttpStatus: number | null;
};

function parseCheckpoint(json: unknown): Fsd3CatalogStageCheckpointV1 | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  return json as Fsd3CatalogStageCheckpointV1;
}

/**
 * Fail-closed authoritative persisted catalog provenance — no run-key/synthetic heuristics.
 */
export function assertFsdP6dAuthoritativePersistedCatalogV1(input: {
  env?: NodeJS.ProcessEnv;
  context: FsdP6dPersistedCatalogRunContextV1;
}): {
  availableSignals: readonly string[];
  declaredCatalogFingerprint: string;
  provenance: FsdP6dAuthoritativeCatalogProvenanceV1;
} {
  const env = input.env ?? process.env;
  const cp = input.context.checkpoint;

  if (input.context.invalidatedAt != null) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_INVALIDATED');
  }
  if (!hasPersistedFsdCatalogFetchV1(cp.catalogFetch)) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_INCOMPLETE');
  }
  const fetch = cp.catalogFetch;
  if (fetch.httpStatus !== 200 && input.context.stageHttpStatus !== 200) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_HTTP_NOT_200');
  }
  if (fetch.catalogFetchSucceeded !== true) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_FETCH_NOT_SUCCEEDED');
  }
  if (fetch.providerKind == null) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_PROVIDER_ORIGIN_MISSING');
  }

  const catalogAttempt = cp.requestLedger.attempts.find(
    (a) => a.attemptKey === FSD3_CATALOG_ATTEMPT_KEY_V1,
  );
  if (!catalogAttempt || catalogAttempt.outcome !== 'SUCCEEDED') {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_LEDGER_NOT_SUCCEEDED');
  }

  if (fetch.providerKind === 'live') {
    if (!fetch.declaredCatalogFingerprint) {
      throw new Error('FSD_P6D_PERSISTED_CATALOG_FINGERPRINT_MISSING');
    }
    const recomputed = buildFsd3DeclaredCatalogFingerprintV1(fetch.availableSignalNames);
    if (recomputed !== fetch.declaredCatalogFingerprint) {
      throw new Error('FSD_P6D_PERSISTED_CATALOG_FINGERPRINT_MISMATCH');
    }
    return {
      availableSignals: [...fetch.availableSignalNames],
      declaredCatalogFingerprint: fetch.declaredCatalogFingerprint,
      provenance: { class: 'LIVE_DIMO_VERIFIED' },
    };
  }

  if (fetch.providerKind === 'mock') {
    if (env.FSD_P6D_FORCE_MOCK_TRANSPORT !== '1') {
      throw new Error('FSD_P6D_MOCK_PERSISTED_CATALOG_REJECTED');
    }
    try {
      parseFsd2DisposableDatabaseNameV1(env.DATABASE_URL ?? '');
    } catch {
      throw new Error('FSD_P6D_MOCK_PERSISTED_CATALOG_REQUIRES_DISPOSABLE_DB');
    }
    const fp = buildFsd3DeclaredCatalogFingerprintV1(fetch.availableSignalNames);
    return {
      availableSignals: [...fetch.availableSignalNames],
      declaredCatalogFingerprint: fetch.declaredCatalogFingerprint ?? fp,
      provenance: { class: 'INTEGRATION_MOCK_DISPOSABLE' },
    };
  }

  throw new Error('FSD_P6D_PERSISTED_CATALOG_PROVIDER_KIND_INVALID');
}

export function parsePersistedCatalogCheckpointV1(json: unknown): Fsd3CatalogStageCheckpointV1 | null {
  return parseCheckpoint(json);
}
