import { buildFsd3DeclaredCatalogFingerprintV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-fingerprint.v1';
import type { FsdP6dVerifiedCatalogEvidenceV1 } from './fsd-p6d-catalog-provenance.v1';

export type FsdP6dVehicleIdentityFreezeV1 = {
  vehicleId: string;
  providerSourceLinkId: string;
  connectionIdentityFingerprint: string;
  dimoTokenId: number;
  declaredCatalogFingerprint: string;
  catalogEvidenceSource: FsdP6dVerifiedCatalogEvidenceV1['source'];
  persistedRunId: string | null;
};

export function buildFsdP6dVehicleIdentityFreezeV1(input: {
  vehicleId: string;
  providerSourceLinkId: string;
  evidence: FsdP6dVerifiedCatalogEvidenceV1;
}): FsdP6dVehicleIdentityFreezeV1 {
  return {
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    connectionIdentityFingerprint: input.evidence.connectionIdentityFingerprint,
    dimoTokenId: input.evidence.dimoTokenId,
    declaredCatalogFingerprint: buildFsd3DeclaredCatalogFingerprintV1(input.evidence.availableSignals),
    catalogEvidenceSource: input.evidence.source,
    persistedRunId: input.evidence.persistedRunId,
  };
}

export function assertFsdP6dPrepareExecuteIdentityFreezeV1(input: {
  label: string;
  freeze: FsdP6dVehicleIdentityFreezeV1;
  connectionIdentityFingerprint: string | null;
  dimoTokenId: number | null;
  evidence: FsdP6dVerifiedCatalogEvidenceV1;
}): void {
  if (input.connectionIdentityFingerprint !== input.freeze.connectionIdentityFingerprint) {
    throw new Error(`FSD_P6D_IDENTITY_DRIFT_${input.label}`);
  }
  if (input.dimoTokenId !== input.freeze.dimoTokenId) {
    throw new Error(`FSD_P6D_TOKEN_DRIFT_${input.label}`);
  }
  const fp = buildFsd3DeclaredCatalogFingerprintV1(input.evidence.availableSignals);
  if (fp !== input.freeze.declaredCatalogFingerprint) {
    throw new Error(`FSD_P6D_CATALOG_FINGERPRINT_DRIFT_${input.label}`);
  }
  if (input.evidence.source !== input.freeze.catalogEvidenceSource) {
    throw new Error(`FSD_P6D_CATALOG_SOURCE_DRIFT_${input.label}`);
  }
  if (input.freeze.persistedRunId && input.evidence.persistedRunId !== input.freeze.persistedRunId) {
    throw new Error(`FSD_P6D_CATALOG_RUN_DRIFT_${input.label}`);
  }
}
