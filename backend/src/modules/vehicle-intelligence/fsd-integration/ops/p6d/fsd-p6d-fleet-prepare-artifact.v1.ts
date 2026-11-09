import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';
import type { FsdP6cFleetManifestV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';
import {
  assertFsdP6dFleetPrepareArtifactAuthenticationTagV1,
  computeFsdP6dFleetPrepareArtifactAuthenticationTagV1,
  resolveFsdP6dFleetPrepareArtifactHmacSecretV1,
} from './fsd-p6d-fleet-prepare-artifact-auth.v1';
import {
  assertFsdP6dFleetProviderAccountingWithinCapV1,
  type FsdP6dFleetProviderAccountingV1,
} from './fsd-p6d-fleet-provider-accounting.v1';

export const FSD_P6D_FLEET_PREPARE_ARTIFACT_SCHEMA_V1 = 'FSD_P6D_FLEET_PREPARE_ARTIFACT_V1' as const;

export type FsdP6dFleetPrepareVehicleBindingV1 = {
  label: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  historicalRequestKey: string;
  historicalWindow: FsdHistoricalWindowV1;
  dimoTokenId: number;
  connectionIdentityFingerprint: string;
  declaredCatalogFingerprint: string;
  catalogPersistedRunId: string | null;
  catalogEvidenceSource: 'PERSISTED_FSD3_RUN' | 'LIVE_CATALOG_LEDGER' | 'PENDING';
};

export type FsdP6dFleetPrepareArtifactV1 = {
  schemaVersion: typeof FSD_P6D_FLEET_PREPARE_ARTIFACT_SCHEMA_V1;
  fleetPrepareRequestKey: string;
  releaseSha: string;
  organizationId: string;
  preparedAtUtc: string;
  providerBudgetFleetPlanned: number;
  providerAccounting: FsdP6dFleetProviderAccountingV1;
  vehicles: readonly FsdP6dFleetPrepareVehicleBindingV1[];
  artifactAuthenticationTag: string;
};

export function finalizeFsdP6dFleetPrepareArtifactV1(
  input: Omit<FsdP6dFleetPrepareArtifactV1, 'artifactAuthenticationTag'>,
  env: NodeJS.ProcessEnv = process.env,
): FsdP6dFleetPrepareArtifactV1 {
  const secret = resolveFsdP6dFleetPrepareArtifactHmacSecretV1(env);
  const artifactAuthenticationTag = computeFsdP6dFleetPrepareArtifactAuthenticationTagV1({
    payload: input,
    secret,
  });
  return { ...input, artifactAuthenticationTag };
}

export function assertFsdP6dFleetPrepareArtifactForExecuteV1(input: {
  artifact: FsdP6dFleetPrepareArtifactV1;
  manifest: FsdP6cFleetManifestV1;
  releaseSha: string;
  fleetPrepareRequestKey: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;
  if (input.artifact.schemaVersion !== FSD_P6D_FLEET_PREPARE_ARTIFACT_SCHEMA_V1) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_SCHEMA_MISMATCH');
  }
  if (input.artifact.fleetPrepareRequestKey !== input.fleetPrepareRequestKey) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_KEY_MISMATCH');
  }
  if (input.artifact.releaseSha !== input.releaseSha) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_RELEASE_SHA_MISMATCH');
  }
  if (input.artifact.organizationId !== input.manifest.organizationId) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_ORG_MISMATCH');
  }

  const secret = resolveFsdP6dFleetPrepareArtifactHmacSecretV1(env);
  assertFsdP6dFleetPrepareArtifactAuthenticationTagV1({ artifact: input.artifact, secret });

  assertFsdP6dFleetProviderAccountingWithinCapV1({
    artifact: input.artifact,
    manifest: input.manifest,
  });

  if (input.manifest.vehicles.length !== input.artifact.vehicles.length) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_VEHICLE_COUNT_MISMATCH');
  }
  for (const manifestVehicle of input.manifest.vehicles) {
    const row = input.artifact.vehicles.find((v) => v.vehicleId === manifestVehicle.vehicleId);
    if (!row) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_VEHICLE_MISSING_${manifestVehicle.label}`);
    }
    if (row.label !== manifestVehicle.label) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_LABEL_DRIFT_${manifestVehicle.label}`);
    }
    if (row.providerSourceLinkId !== manifestVehicle.providerSourceLinkId) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_SOURCE_LINK_DRIFT_${manifestVehicle.label}`);
    }
    if (row.discoveryRequestKey !== manifestVehicle.discoveryRequestKey) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_DISCOVERY_KEY_DRIFT_${manifestVehicle.label}`);
    }
    if (row.historicalRequestKey !== manifestVehicle.historicalRequestKey) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_HISTORICAL_KEY_DRIFT_${manifestVehicle.label}`);
    }
    if (row.catalogEvidenceSource === 'PENDING' || !row.catalogPersistedRunId) {
      throw new Error(`FSD_P6D_PREPARE_ARTIFACT_CATALOG_PENDING_${manifestVehicle.label}`);
    }
  }
}
