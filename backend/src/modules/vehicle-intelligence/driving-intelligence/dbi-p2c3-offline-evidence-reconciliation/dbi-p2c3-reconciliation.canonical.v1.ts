import type { DbiP2c2ProxyCandidateEnvelopeV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import {
  canonicalJsonStringify,
  tryCanonicalJsonStringify,
  type DbiP2c3CanonicalJsonFailureReasonV1,
} from './dbi-p2c3-reconciliation.canonical-json.v1';

function envelopeIdentityObject(envelope: DbiP2c2ProxyCandidateEnvelopeV1): Record<string, unknown> {
  const base = {
    sourceModule: envelope.sourceModule,
    sourceEpisodeKey: envelope.sourceEpisodeKey,
    originalClassification: envelope.originalClassification,
    originalCandidate: envelope.originalCandidate,
  };
  if (envelope.sourceModule === 'P2-B1') {
    return { ...base, originalCandidateSupportTier: envelope.originalCandidateSupportTier };
  }
  if (envelope.sourceModule === 'P2-B2') {
    return { ...base, proxyKind: envelope.proxyKind };
  }
  if (envelope.sourceModule === 'P2-B4') {
    return { ...base, facet: envelope.facet };
  }
  return base;
}

export type DbiP2c3CandidateIdentityPayloadResultV1 =
  | { readonly ok: true; readonly payload: string }
  | { readonly ok: false; readonly reason: DbiP2c3CanonicalJsonFailureReasonV1 };

export function tryBuildCandidateEnvelopeIdentityPayload(
  envelope: DbiP2c2ProxyCandidateEnvelopeV1,
): DbiP2c3CandidateIdentityPayloadResultV1 {
  const stringify = tryCanonicalJsonStringify(envelopeIdentityObject(envelope));
  if (!stringify.ok) {
    return { ok: false, reason: stringify.reason };
  }
  return { ok: true, payload: stringify.json };
}

/** Stable canonical JSON for same-source duplicate detection — full relevant adapter envelope, not episodeKey alone. */
export function buildCandidateEnvelopeIdentityPayload(envelope: DbiP2c2ProxyCandidateEnvelopeV1): string {
  const built = tryBuildCandidateEnvelopeIdentityPayload(envelope);
  if (!built.ok) {
    throw new Error(`DBI_P2C3_CANDIDATE_IDENTITY_INVARIANT:${built.reason}`);
  }
  return built.payload;
}

export function compareIsoIntervalOverlapOnly(left: unknown, right: unknown): boolean {
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const l = left as Record<string, unknown>;
  const r = right as Record<string, unknown>;
  const startKeys = ['providerBucketLabelStartIso', 'startIso', 'intervalStartIso'] as const;
  const endKeys = ['providerBucketLabelEndIso', 'endIso', 'intervalEndIso'] as const;
  for (const sk of startKeys) {
    for (const ek of endKeys) {
      const ls = l[sk];
      const le = l[ek];
      const rs = r[sk];
      const re = r[ek];
      if (
        typeof ls === 'string' &&
        typeof le === 'string' &&
        typeof rs === 'string' &&
        typeof re === 'string' &&
        ls === rs &&
        le === re
      ) {
        return true;
      }
    }
  }
  return false;
}
