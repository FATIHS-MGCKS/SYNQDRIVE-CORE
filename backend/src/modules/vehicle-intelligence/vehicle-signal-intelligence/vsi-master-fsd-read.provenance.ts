import { assertFsdP6dAuthoritativePersistedCatalogV1 } from '@modules/vehicle-intelligence/fsd-integration/ops/p6d/fsd-p6d-catalog-provenance-authority.v1';
import type { Fsd3CatalogStageCheckpointV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import type {
  MasterFsdCatalogAvailabilityV1,
  MasterFsdProvenanceClassV1,
} from './vsi-master-fsd-read.types';

export type MasterFsdPersistedCatalogReadContextV1 = {
  runId: string;
  runKey: string;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoTokenId: number | null;
  connectionIdentityFingerprint: string | null;
  invalidatedAt: Date | null;
  checkpoint: Fsd3CatalogStageCheckpointV1;
  stageHttpStatus: number | null;
};

export type MasterFsdCatalogProvenanceReadV1 = {
  availability: MasterFsdCatalogAvailabilityV1;
  provenanceClass: MasterFsdProvenanceClassV1;
  declaredSignalCount: number | null;
  declaredCatalogFingerprint: string | null;
  authoritativeRunId: string | null;
  rejectionReason: string | null;
};

export function resolvePersistedCatalogProvenanceReadV1(
  ctx: MasterFsdPersistedCatalogReadContextV1,
  env: NodeJS.ProcessEnv = process.env,
): MasterFsdCatalogProvenanceReadV1 {
  if (ctx.checkpoint.catalogFetch?.providerKind === 'mock') {
    const names = ctx.checkpoint.catalogFetch.availableSignalNames ?? [];
    return {
      availability: 'PRESENT_NOT_AUTHORITATIVE',
      provenanceClass: 'INTEGRATION_MOCK_DISPOSABLE',
      declaredSignalCount: names.length > 0 ? names.length : null,
      declaredCatalogFingerprint: ctx.checkpoint.catalogFetch.declaredCatalogFingerprint ?? null,
      authoritativeRunId: ctx.runId,
      rejectionReason: 'PERSISTED_MOCK_CATALOG',
    };
  }

  if (ctx.invalidatedAt != null) {
    return {
      availability: 'INVALIDATED',
      provenanceClass: 'UNVERIFIED',
      declaredSignalCount: null,
      declaredCatalogFingerprint: null,
      authoritativeRunId: ctx.runId,
      rejectionReason: 'RUN_INVALIDATED',
    };
  }

  try {
    const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
      env,
      context: {
        runId: ctx.runId,
        runKey: ctx.runKey,
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        providerSourceLinkId: ctx.providerSourceLinkId,
        dimoTokenId: ctx.dimoTokenId ?? 0,
        connectionIdentityFingerprint: ctx.connectionIdentityFingerprint ?? '',
        invalidatedAt: null,
        checkpoint: ctx.checkpoint,
        stageHttpStatus: ctx.stageHttpStatus,
      },
    });
    return {
      availability: 'AUTHORITATIVE_LIVE',
      provenanceClass:
        authoritative.provenance.class === 'LIVE_DIMO_VERIFIED'
          ? 'LIVE_DIMO_VERIFIED'
          : 'INTEGRATION_MOCK_DISPOSABLE',
      declaredSignalCount: authoritative.availableSignals.length,
      declaredCatalogFingerprint: authoritative.declaredCatalogFingerprint,
      authoritativeRunId: ctx.runId,
      rejectionReason: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('MOCK') || message.includes('INTEGRATION_MOCK')) {
      const names = ctx.checkpoint.catalogFetch?.availableSignalNames ?? [];
      return {
        availability: 'PRESENT_NOT_AUTHORITATIVE',
        provenanceClass: 'INTEGRATION_MOCK_DISPOSABLE',
        declaredSignalCount: names.length > 0 ? names.length : null,
        declaredCatalogFingerprint: ctx.checkpoint.catalogFetch?.declaredCatalogFingerprint ?? null,
        authoritativeRunId: ctx.runId,
        rejectionReason: message,
      };
    }
    return {
      availability: 'PRESENT_NOT_AUTHORITATIVE',
      provenanceClass: 'UNVERIFIED',
      declaredSignalCount: ctx.checkpoint.catalogFetch?.availableSignalNames?.length ?? null,
      declaredCatalogFingerprint: ctx.checkpoint.catalogFetch?.declaredCatalogFingerprint ?? null,
      authoritativeRunId: ctx.runId,
      rejectionReason: message,
    };
  }
}
