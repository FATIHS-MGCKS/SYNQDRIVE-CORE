import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FsdP6dFleetPrepareArtifactV1 } from './fsd-p6d-fleet-prepare-artifact.v1';

export const FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV =
  'FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET' as const;

export function resolveFsdP6dFleetPrepareArtifactHmacSecretV1(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]?.trim();
  if (!secret) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_HMAC_SECRET_MISSING');
  }
  return secret;
}

export function buildFsdP6dFleetPrepareArtifactSigningPayloadV1(
  input: Omit<FsdP6dFleetPrepareArtifactV1, 'artifactAuthenticationTag'>,
): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    fleetPrepareRequestKey: input.fleetPrepareRequestKey,
    releaseSha: input.releaseSha,
    organizationId: input.organizationId,
    preparedAtUtc: input.preparedAtUtc,
    providerBudgetFleetPlanned: input.providerBudgetFleetPlanned,
    providerAccounting: input.providerAccounting,
    vehicles: input.vehicles.map((v) => ({
      label: v.label,
      vehicleId: v.vehicleId,
      providerSourceLinkId: v.providerSourceLinkId,
      discoveryRequestKey: v.discoveryRequestKey,
      historicalRequestKey: v.historicalRequestKey,
      historicalWindow: v.historicalWindow,
      dimoTokenId: v.dimoTokenId,
      connectionIdentityFingerprint: v.connectionIdentityFingerprint,
      declaredCatalogFingerprint: v.declaredCatalogFingerprint,
      catalogPersistedRunId: v.catalogPersistedRunId,
      catalogEvidenceSource: v.catalogEvidenceSource,
    })),
  });
}

export function computeFsdP6dFleetPrepareArtifactAuthenticationTagV1(input: {
  payload: Omit<FsdP6dFleetPrepareArtifactV1, 'artifactAuthenticationTag'>;
  secret: string;
}): string {
  const body = buildFsdP6dFleetPrepareArtifactSigningPayloadV1(input.payload);
  return createHmac('sha256', input.secret).update(body).digest('hex');
}

export function assertFsdP6dFleetPrepareArtifactAuthenticationTagV1(input: {
  artifact: FsdP6dFleetPrepareArtifactV1;
  secret: string;
}): void {
  const { artifactAuthenticationTag, ...rest } = input.artifact;
  const expected = computeFsdP6dFleetPrepareArtifactAuthenticationTagV1({
    payload: rest,
    secret: input.secret,
  });
  const a = Buffer.from(artifactAuthenticationTag, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('FSD_P6D_PREPARE_ARTIFACT_AUTHENTICATION_FAILED');
  }
}
