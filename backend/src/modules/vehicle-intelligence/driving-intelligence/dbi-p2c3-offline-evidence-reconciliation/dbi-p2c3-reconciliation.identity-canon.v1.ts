import type { DbiP2c2ParticipantIdentityV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';
import { tryCanonicalJsonStringify } from './dbi-p2c3-reconciliation.canonical-json.v1';

export const DBI_P2C3_PARTICIPANT_IDENTITY_KEYS = [
  'organizationId',
  'vehicleId',
  'tripId',
  'providerSourceLinkId',
  'v1bInputFingerprint',
  'multichannelFingerprint',
  'sourceBundleId',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildCanonicalParticipantIdentity(
  identity: DbiP2c2ParticipantIdentityV1,
): Record<(typeof DBI_P2C3_PARTICIPANT_IDENTITY_KEYS)[number], unknown> {
  return {
    organizationId: identity.organizationId,
    vehicleId: identity.vehicleId,
    tripId: identity.tripId,
    providerSourceLinkId: identity.providerSourceLinkId,
    v1bInputFingerprint: identity.v1bInputFingerprint,
    multichannelFingerprint: identity.multichannelFingerprint,
    sourceBundleId: identity.sourceBundleId,
  };
}

export function validateParticipantIdentityShape(
  identity: unknown,
  codes: DbiP2c3ReconciliationDiagnosticCodeV1[],
): void {
  if (!isPlainObject(identity)) {
    codes.push('BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  for (const key of Object.keys(identity)) {
    if (!(DBI_P2C3_PARTICIPANT_IDENTITY_KEYS as readonly string[]).includes(key)) {
      codes.push('PARTICIPANT_IDENTITY_EXTRA_FIELD');
    }
  }
  for (const required of DBI_P2C3_PARTICIPANT_IDENTITY_KEYS) {
    if (!(required in identity)) {
      codes.push('BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  const canon = tryCanonicalJsonStringify(buildCanonicalParticipantIdentity(identity as DbiP2c2ParticipantIdentityV1));
  if (!canon.ok) {
    codes.push('CANDIDATE_PAYLOAD_CANONICAL_INVALID');
  }
}

export function participantPlaneIdentityKey(input: {
  readonly sourceModule: string;
  readonly identity: DbiP2c2ParticipantIdentityV1;
}): { readonly ok: true; readonly key: string } | { readonly ok: false } {
  const payload = {
    sourceModule: input.sourceModule,
    identity: buildCanonicalParticipantIdentity(input.identity),
  };
  const result = tryCanonicalJsonStringify(payload);
  if (!result.ok) {
    return { ok: false };
  }
  return { ok: true, key: result.json };
}
