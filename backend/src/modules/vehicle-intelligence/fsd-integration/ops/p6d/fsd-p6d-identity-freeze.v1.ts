import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';
import type { FsdP6dVerifiedCatalogEvidenceV1 } from './fsd-p6d-catalog-provenance.v1';

export type FsdP6dVehicleIdentityFreezeV1 = {
  vehicleId: string;
  providerSourceLinkId: string;
  connectionIdentityFingerprint: string;
  dimoTokenId: number;
  declaredCatalogFingerprint: string;
  catalogEvidenceSource: FsdP6dVerifiedCatalogEvidenceV1['source'];
  persistedRunId: string;
  historicalWindow: FsdHistoricalWindowV1;
};

export function buildFsdP6dVehicleIdentityFreezeV1(input: {
  vehicleId: string;
  providerSourceLinkId: string;
  historicalWindow: FsdHistoricalWindowV1;
  evidence: FsdP6dVerifiedCatalogEvidenceV1;
}): FsdP6dVehicleIdentityFreezeV1 {
  return {
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    connectionIdentityFingerprint: input.evidence.connectionIdentityFingerprint,
    dimoTokenId: input.evidence.dimoTokenId,
    declaredCatalogFingerprint: input.evidence.declaredCatalogFingerprint,
    catalogEvidenceSource: input.evidence.source,
    persistedRunId: input.evidence.persistedRunId,
    historicalWindow: input.historicalWindow,
  };
}

export function assertFsdP6dPrepareExecuteIdentityFreezeV1(input: {
  label: string;
  freeze: FsdP6dVehicleIdentityFreezeV1;
  providerSourceLinkId: string;
  connectionIdentityFingerprint: string | null;
  dimoTokenId: number | null;
  evidence: FsdP6dVerifiedCatalogEvidenceV1;
  historicalWindow: FsdHistoricalWindowV1;
}): void {
  if (input.connectionIdentityFingerprint !== input.freeze.connectionIdentityFingerprint) {
    throw new Error(`FSD_P6D_IDENTITY_DRIFT_${input.label}`);
  }
  if (input.providerSourceLinkId !== input.freeze.providerSourceLinkId) {
    throw new Error(`FSD_P6D_SOURCE_LINK_DRIFT_${input.label}`);
  }
  if (input.dimoTokenId !== input.freeze.dimoTokenId) {
    throw new Error(`FSD_P6D_TOKEN_DRIFT_${input.label}`);
  }
  if (input.evidence.declaredCatalogFingerprint !== input.freeze.declaredCatalogFingerprint) {
    throw new Error(`FSD_P6D_CATALOG_FINGERPRINT_DRIFT_${input.label}`);
  }
  if (input.evidence.source !== input.freeze.catalogEvidenceSource) {
    throw new Error(`FSD_P6D_CATALOG_SOURCE_DRIFT_${input.label}`);
  }
  if (input.evidence.persistedRunId !== input.freeze.persistedRunId) {
    throw new Error(`FSD_P6D_CATALOG_RUN_DRIFT_${input.label}`);
  }
  if (
    input.historicalWindow.fromUtc !== input.freeze.historicalWindow.fromUtc ||
    input.historicalWindow.toUtc !== input.freeze.historicalWindow.toUtc
  ) {
    throw new Error(`FSD_P6D_HISTORICAL_WINDOW_DRIFT_${input.label}`);
  }
}
