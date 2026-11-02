import type { PrismaClient } from '@prisma/client';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4LongitudinalEvidenceChannelManifestEntryV1, Ds4LongitudinalEvidenceQualityContextV1 } from './ds4-longitudinal-evidence-quality.v1';

const KNOWN_SOURCE_FAMILIES = new Set<TelemetrySourceFamily>(['RUPTELA_R1', 'API_SYNTHETIC', 'UNKNOWN']);

function parseSourceFamily(raw: unknown): TelemetrySourceFamily | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return KNOWN_SOURCE_FAMILIES.has(raw as TelemetrySourceFamily) ? (raw as TelemetrySourceFamily) : null;
}

function parseChannelManifest(raw: unknown): Ds4LongitudinalEvidenceQualityContextV1['channelManifest'] {
  if (!Array.isArray(raw)) return undefined;
  const out: Ds4LongitudinalEvidenceChannelManifestEntryV1[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== 'object') continue;
    const channel = (row as { channel?: unknown }).channel;
    const outcome = (row as { outcome?: unknown }).outcome;
    if (typeof channel === 'string' && typeof outcome === 'string') {
      out.push({ channel, outcome });
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Read-only: resolves S4 source family + channel manifest for Layer-2 evidence projection. */
export async function loadDs4LongitudinalEvidenceQualityContextV1(
  prisma: PrismaClient,
  scope: {
    organizationId: string;
    tripId: string;
    pinnedSnapshotHash: string;
    sparseChannelOutcome: string | null;
  },
): Promise<Ds4LongitudinalEvidenceQualityContextV1 | null> {
  if (!scope.pinnedSnapshotHash?.trim()) {
    return null;
  }

  const workRows = await prisma.$queryRaw<Array<{ source_family: string }>>`
    SELECT source_family
    FROM di_v0_s4_work_items
    WHERE organization_id = ${scope.organizationId}
      AND trip_id = ${scope.tripId}
      AND pinned_snapshot_hash = ${scope.pinnedSnapshotHash}
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 1
  `;

  const sourceFamily = parseSourceFamily(workRows[0]?.source_family);
  if (sourceFamily == null) {
    return null;
  }

  const snapshotRows = await prisma.$queryRaw<Array<{ channel_manifest: unknown }>>`
    SELECT channel_manifest
    FROM di_v0_s4_evidence_snapshots
    WHERE organization_id = ${scope.organizationId}
      AND trip_id = ${scope.tripId}
      AND snapshot_hash = ${scope.pinnedSnapshotHash}
    LIMIT 1
  `;

  return {
    sourceFamily,
    channelManifest: parseChannelManifest(snapshotRows[0]?.channel_manifest),
    sparseChannelOutcome: scope.sparseChannelOutcome,
  };
}
