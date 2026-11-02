import type { PrismaClient } from '@prisma/client';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { Ds4Layer2P2OfflineReconstructionReadRepositoryV1 } from '../export/ds4-layer2-p2-offline-reconstruction.repository.v1';
import { decodeMotionCoreShadowPayloadGzipV1 } from '../export/ds4-layer2-p2-offline-reconstruction.v1';
import type { Ds4Layer2P4bJoinFailureReasonV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';

export type Ds4Layer2P4bLoadedMotionPayloadV1 = {
  payload: DiV0MotionCoreShadowPayloadV1;
  sourceMotionRunId: string;
  contentFingerprint: string;
  speedAuthority: string | null;
  sourceMotionRevision: string;
  shadowBundleVersion: string | null;
};

export type Ds4Layer2P4bPayloadLoadFailureV1 = {
  ok: false;
  reason: Ds4Layer2P4bJoinFailureReasonV1;
  detail: string;
};

export type Ds4Layer2P4bPayloadLoadSuccessV1 = {
  ok: true;
  loaded: Ds4Layer2P4bLoadedMotionPayloadV1;
};

export type Ds4Layer2P4bPayloadLoadResultV1 = Ds4Layer2P4bPayloadLoadFailureV1 | Ds4Layer2P4bPayloadLoadSuccessV1;

export interface Ds4Layer2P4bMotionPayloadLoaderV1 {
  loadPinnedMotionPayload(input: {
    organizationId: string;
    tripId: string;
    sourceMotionRunId: string;
    expectedContentFingerprint: string;
  }): Promise<Ds4Layer2P4bPayloadLoadResultV1>;
}

function resolveSourceMotionRevision(payload: DiV0MotionCoreShadowPayloadV1): string {
  return payload.contract?.algorithmVersions?.bundle ?? 'UNKNOWN_BUNDLE';
}

export function createDs4Layer2P4bPrismaPayloadLoaderV1(prisma: PrismaClient): Ds4Layer2P4bMotionPayloadLoaderV1 {
  const repo = new Ds4Layer2P2OfflineReconstructionReadRepositoryV1(prisma);
  return {
    async loadPinnedMotionPayload(input) {
      const gzip = await repo.loadMotionRunPayloadGzip(input.sourceMotionRunId, input.organizationId);
      if (!gzip) {
        return { ok: false, reason: 'MISSING_PAYLOAD', detail: `No payload_gzip for run ${input.sourceMotionRunId}` };
      }
      const { payload, corrupt } = decodeMotionCoreShadowPayloadGzipV1(gzip);
      if (!payload || corrupt) {
        return { ok: false, reason: 'CORRUPT_PAYLOAD', detail: `Decode failed for run ${input.sourceMotionRunId}` };
      }

      const metas = await repo.loadSucceededMotionRunsForTrip({
        organizationId: input.organizationId,
        tripId: input.tripId,
      });
      const meta = metas.find((m) => m.id === input.sourceMotionRunId);
      if (!meta) {
        return {
          ok: false,
          reason: 'SOURCE_RUN_MISMATCH',
          detail: `Run ${input.sourceMotionRunId} not a SUCCEEDED run for trip ${input.tripId}`,
        };
      }
      if (meta.tripId !== input.tripId) {
        return {
          ok: false,
          reason: 'SOURCE_RUN_MISMATCH',
          detail: `Run trip ${meta.tripId} != expected ${input.tripId}`,
        };
      }
      if (meta.contentFingerprint !== input.expectedContentFingerprint) {
        return {
          ok: false,
          reason: 'CONTENT_FINGERPRINT_MISMATCH',
          detail: `Expected fingerprint ${input.expectedContentFingerprint}, got ${meta.contentFingerprint}`,
        };
      }

      const summary = meta.summaryJson as { bundleVersion?: string } | null;
      return {
        ok: true,
        loaded: {
          payload,
          sourceMotionRunId: input.sourceMotionRunId,
          contentFingerprint: meta.contentFingerprint,
          speedAuthority: payload.contract?.speedAuthority ?? null,
          sourceMotionRevision: resolveSourceMotionRevision(payload),
          shadowBundleVersion: summary?.bundleVersion ?? null,
        },
      };
    },
  };
}

/** In-memory loader for unit tests — no database. */
export function createDs4Layer2P4bMapPayloadLoaderV1(
  payloadsByRunId: Map<string, Ds4Layer2P4bLoadedMotionPayloadV1>,
): Ds4Layer2P4bMotionPayloadLoaderV1 {
  return {
    async loadPinnedMotionPayload(input) {
      const loaded = payloadsByRunId.get(input.sourceMotionRunId);
      if (!loaded) {
        return { ok: false, reason: 'MISSING_PAYLOAD', detail: `Mock missing run ${input.sourceMotionRunId}` };
      }
      if (loaded.contentFingerprint !== input.expectedContentFingerprint) {
        return {
          ok: false,
          reason: 'CONTENT_FINGERPRINT_MISMATCH',
          detail: `Mock fingerprint mismatch for ${input.sourceMotionRunId}`,
        };
      }
      return { ok: true, loaded };
    },
  };
}
