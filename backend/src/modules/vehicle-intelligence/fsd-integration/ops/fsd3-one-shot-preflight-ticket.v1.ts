import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { stableStringifyFsd3OneShotV1 } from './fsd3-one-shot-canonical-json.v1';
import type { Fsd3OneShotCliScopeV1 } from './fsd3-one-shot-owner-approval.v1';
import type { Fsd3OneShotPreflightResultV1 } from './fsd3-one-shot-preflight.service';

export const FSD3_ONE_SHOT_PREFLIGHT_TICKET_SCHEMA_V1 = 'FSD3_ONE_SHOT_PREFLIGHT_TICKET_V1' as const;

export type Fsd3OneShotPreflightTicketPayloadV1 = {
  schemaVersion: typeof FSD3_ONE_SHOT_PREFLIGHT_TICKET_SCHEMA_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  attestedExecutableReleaseSha: string;
  actorUserId: string;
  authorizationReference: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  connectionIdentityFingerprint: string;
  issuedAtIso: string;
  expiresAtIso: string;
};

const PREFLIGHT_TICKET_TTL_MS = 10 * 60 * 1000;

export function mintFsd3OneShotPreflightTicketV1(input: {
  scope: Fsd3OneShotCliScopeV1;
  preflight: Fsd3OneShotPreflightResultV1;
  actorUserId: string;
  secret: Buffer;
  now?: Date;
}): string {
  if (input.preflight.status !== 'PREFLIGHT_OK') {
    throw new Error('FSD3_PREFLIGHT_TICKET_INVALID');
  }
  if (
    input.preflight.organizationId !== input.scope.organizationId ||
    input.preflight.vehicleId !== input.scope.vehicleId ||
    input.preflight.providerSourceLinkId !== input.scope.providerSourceLinkId
  ) {
    throw new Error('FSD3_PREFLIGHT_TICKET_SCOPE_MISMATCH');
  }
  if (!input.preflight.dimoVehicleId || input.preflight.dimoTokenId == null) {
    throw new Error('FSD3_PREFLIGHT_TICKET_IDENTITY_INCOMPLETE');
  }
  if (!input.preflight.connectionIdentityFingerprint) {
    throw new Error('FSD3_PREFLIGHT_TICKET_IDENTITY_INCOMPLETE');
  }

  const now = input.now ?? new Date();
  const payload: Fsd3OneShotPreflightTicketPayloadV1 = {
    schemaVersion: FSD3_ONE_SHOT_PREFLIGHT_TICKET_SCHEMA_V1,
    organizationId: input.scope.organizationId,
    vehicleId: input.scope.vehicleId,
    providerSourceLinkId: input.scope.providerSourceLinkId,
    discoveryRequestKey: input.scope.discoveryRequestKey,
    attestedExecutableReleaseSha: input.scope.executableReleaseSha,
    actorUserId: input.actorUserId,
    authorizationReference: input.preflight.authorizationReference,
    dimoVehicleId: input.preflight.dimoVehicleId,
    dimoTokenId: input.preflight.dimoTokenId,
    connectionIdentityFingerprint: input.preflight.connectionIdentityFingerprint,
    issuedAtIso: now.toISOString(),
    expiresAtIso: new Date(now.getTime() + PREFLIGHT_TICKET_TTL_MS).toISOString(),
  };
  const mac = createHmac('sha256', input.secret)
    .update(stableStringifyFsd3OneShotV1(payload), 'utf8')
    .digest('base64');
  return Buffer.from(JSON.stringify({ payload, macBase64: mac }), 'utf8').toString('base64url');
}

export function verifyFsd3OneShotPreflightTicketV1(input: {
  token: string;
  scope: Fsd3OneShotCliScopeV1;
  actorUserId: string;
  secret: Buffer;
  now?: Date;
}): Fsd3OneShotPreflightTicketPayloadV1 {
  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(input.token, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('FSD3_PREFLIGHT_TICKET_MALFORMED');
  }
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('FSD3_PREFLIGHT_TICKET_MALFORMED');
  }
  const e = envelope as { payload?: Fsd3OneShotPreflightTicketPayloadV1; macBase64?: string };
  if (!e.payload || typeof e.macBase64 !== 'string') {
    throw new Error('FSD3_PREFLIGHT_TICKET_MALFORMED');
  }
  const expectedMac = createHmac('sha256', input.secret)
    .update(stableStringifyFsd3OneShotV1(e.payload), 'utf8')
    .digest();
  const actualMac = Buffer.from(e.macBase64, 'base64');
  if (actualMac.length !== expectedMac.length || !timingSafeEqual(actualMac, expectedMac)) {
    throw new Error('FSD3_PREFLIGHT_TICKET_FORGED');
  }
  const now = input.now ?? new Date();
  const expires = new Date(e.payload.expiresAtIso);
  if (Number.isNaN(expires.getTime()) || now > expires) {
    throw new Error('FSD3_PREFLIGHT_TICKET_EXPIRED');
  }
  if (e.payload.actorUserId !== input.actorUserId) {
    throw new Error('FSD3_PREFLIGHT_TICKET_ACTOR_MISMATCH');
  }
  if (
    e.payload.organizationId !== input.scope.organizationId ||
    e.payload.vehicleId !== input.scope.vehicleId ||
    e.payload.providerSourceLinkId !== input.scope.providerSourceLinkId ||
    e.payload.discoveryRequestKey !== input.scope.discoveryRequestKey ||
    e.payload.attestedExecutableReleaseSha !== input.scope.executableReleaseSha
  ) {
    throw new Error('FSD3_PREFLIGHT_TICKET_SCOPE_MISMATCH');
  }
  return e.payload;
}

export function resolveFsd3OneShotPreflightTicketSecretV1(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.FSD3_ONE_SHOT_PREFLIGHT_TICKET_HMAC_SECRET?.trim();
  if (env.FSD3_ONE_SHOT_LIVE_EPHEMERAL_SECRETS_REQUIRED === '1' && raw) {
    throw new Error('FSD3_LIVE_HMAC_SECRET_ENV_FORBIDDEN');
  }
  if (raw) {
    return Buffer.from(raw, 'utf8');
  }
  return randomBytes(32);
}
