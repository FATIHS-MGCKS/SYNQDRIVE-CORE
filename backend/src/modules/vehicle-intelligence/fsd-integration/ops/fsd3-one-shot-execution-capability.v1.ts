import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { stableStringifyFsd3OneShotV1 } from './fsd3-one-shot-canonical-json.v1';

export const FSD3_ONE_SHOT_EXECUTION_CAPABILITY_SCHEMA_V1 = 'FSD3_ONE_SHOT_EXECUTION_CAPABILITY_V1' as const;

export type Fsd3OneShotLiveProviderV1 = 'mock' | 'dimo_live';

export type Fsd3OneShotExecutionCapabilityPayloadV1 = {
  schemaVersion: typeof FSD3_ONE_SHOT_EXECUTION_CAPABILITY_SCHEMA_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
  attestedExecutableReleaseSha: string;
  approvalReference: string;
  liveProvider: Fsd3OneShotLiveProviderV1;
  actorUserId: string;
  operatorAuthorizationReference: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  connectionIdentityFingerprint: string;
  issuedAtIso: string;
  expiresAtIso: string;
};

export type Fsd3OneShotExecutionCapabilityEnvelopeV1 = {
  payload: Fsd3OneShotExecutionCapabilityPayloadV1;
  macBase64: string;
};

const CAPABILITY_TTL_MS = 10 * 60 * 1000;

export function mintFsd3OneShotExecutionCapabilityV1(input: {
  payload: Omit<
    Fsd3OneShotExecutionCapabilityPayloadV1,
    'schemaVersion' | 'issuedAtIso' | 'expiresAtIso'
  >;
  secret: Buffer;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload: Fsd3OneShotExecutionCapabilityPayloadV1 = {
    schemaVersion: FSD3_ONE_SHOT_EXECUTION_CAPABILITY_SCHEMA_V1,
    ...input.payload,
    issuedAtIso: now.toISOString(),
    expiresAtIso: new Date(now.getTime() + CAPABILITY_TTL_MS).toISOString(),
  };
  const mac = createHmac('sha256', input.secret)
    .update(stableStringifyFsd3OneShotV1(payload), 'utf8')
    .digest('base64');
  const envelope: Fsd3OneShotExecutionCapabilityEnvelopeV1 = { payload, macBase64: mac };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

export function verifyFsd3OneShotExecutionCapabilityV1(input: {
  token: string;
  secret: Buffer;
  now?: Date;
}): Fsd3OneShotExecutionCapabilityPayloadV1 {
  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(input.token, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('FSD3_EXECUTION_CAPABILITY_MALFORMED');
  }
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('FSD3_EXECUTION_CAPABILITY_MALFORMED');
  }
  const e = envelope as Fsd3OneShotExecutionCapabilityEnvelopeV1;
  if (!e.payload || typeof e.macBase64 !== 'string') {
    throw new Error('FSD3_EXECUTION_CAPABILITY_MALFORMED');
  }
  const expectedMac = createHmac('sha256', input.secret)
    .update(stableStringifyFsd3OneShotV1(e.payload), 'utf8')
    .digest();
  const actualMac = Buffer.from(e.macBase64, 'base64');
  if (actualMac.length !== expectedMac.length || !timingSafeEqual(actualMac, expectedMac)) {
    throw new Error('FSD3_EXECUTION_CAPABILITY_FORGED');
  }
  const now = input.now ?? new Date();
  const expires = new Date(e.payload.expiresAtIso);
  if (Number.isNaN(expires.getTime()) || now > expires) {
    throw new Error('FSD3_EXECUTION_CAPABILITY_EXPIRED');
  }
  if (e.payload.schemaVersion !== FSD3_ONE_SHOT_EXECUTION_CAPABILITY_SCHEMA_V1) {
    throw new Error('FSD3_EXECUTION_CAPABILITY_MALFORMED');
  }
  return e.payload;
}

export function resolveFsd3OneShotCapabilitySecretV1(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET?.trim();
  if (raw) {
    return Buffer.from(raw, 'utf8');
  }
  return randomBytes(32);
}
