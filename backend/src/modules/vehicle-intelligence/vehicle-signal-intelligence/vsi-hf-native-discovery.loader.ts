/**
 * VSI P2 — historical HF native signal discovery from persisted telemetry_hf_points.
 *
 * Independent from snapshot axis; never infers historical evidence from VLS or catalog.
 */

import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import type { PrismaClient } from '@prisma/client';
import { TripStatus } from '@prisma/client';
import {
  evaluateCanonicalProviderNativeAlias,
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  type VsiCanonicalSignalKey,
} from './canonical-signal-keys';
import {
  VSI_DISCOVERY_CH_HISTORY_DAYS,
  VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS,
  VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS,
  VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
} from './vsi-clickhouse-discovery-safety.contract';
import {
  emptyNativeSignalDiscoveryInventory,
  VsiNativeDiscoveryIngestionLimitation,
  type VsiNativeSignalDiscoveryInventoryScopeV1,
  type VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import {
  VsiEvidenceAxisEvaluationState,
} from './vsi-native-signal-discovery-evaluation-state';
import { clipTripWindowsToLinkBounds } from './vsi-profile-cadence-stats.util';
import {
  evaluateTripWindowSourceLinkAttributionV1,
  VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW,
  type VsiSourceLinkIntervalV1,
} from './vsi-rpm-hf-link-scoped-cadence-evidence.util';
import { buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis } from './vsi-hf-native-discovery.entry-builders';
import {
  buildHistoricalAxisForUnionNativeKey,
  type VsiHfHistoricalEvaluationContextV1,
} from './vsi-hf-native-discovery-negative-evidence';
import { selectUnionNativeSignalNamesForHfEvaluation } from './vsi-hf-native-discovery.union-key';
import type { VsiNativeSignalDiscoveryInventoryEntryV1 } from './vsi-native-signal-discovery-inventory.contract';

export type VsiHfNativeDiscoveryLoadInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  projectionAsOf: Date;
  linkActivatedAt: Date;
  linkDeactivatedAt: Date | null;
  clickHouseHf: ClickHouseHfService | undefined;
  /** Head inventory before HF merge — enables union-key negative historical evaluation. */
  persistedInventory?: VsiNativeSignalDiscoveryInventoryV1 | null;
};

type SignalAggregate = {
  pointCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  tripCountWithPoints: number;
  windowStartAt: string | null;
  windowEndAt: string | null;
  readCapApplied: number | null;
  attributionLimitations: Set<string>;
  queryFailed: boolean;
};

function resolveNativeAliasVerdictForDiscovery(nativeName: string): {
  verdict: 'EXPLICIT_PRIMARY_ALIAS' | 'ALIAS_CONFLICT_UNRESOLVED' | 'UNKNOWN_SIGNAL';
  canonicalSignalKey: string | null;
} {
  let matched: VsiCanonicalSignalKey | null = null;
  for (const key of Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS) as VsiCanonicalSignalKey[]) {
    const verdict = evaluateCanonicalProviderNativeAlias(key, nativeName);
    if (verdict === 'EXPLICIT_PRIMARY_ALIAS') {
      if (matched && matched !== key) {
        return { verdict: 'ALIAS_CONFLICT_UNRESOLVED', canonicalSignalKey: null };
      }
      matched = key;
    }
  }
  if (matched) {
    return { verdict: 'EXPLICIT_PRIMARY_ALIAS', canonicalSignalKey: matched };
  }
  return { verdict: 'UNKNOWN_SIGNAL', canonicalSignalKey: null };
}

export async function buildHfNativeDiscoveryInventoryUpdate(
  prisma: Pick<PrismaClient, 'vehicleTrip' | 'vehicleDataSourceLink'>,
  input: VsiHfNativeDiscoveryLoadInput,
): Promise<VsiNativeSignalDiscoveryInventoryV1> {
  const scope: VsiNativeSignalDiscoveryInventoryScopeV1 = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    providerIdentity: input.providerIdentity,
  };
  const evaluatedWindowStart = new Date(
    Math.max(
      input.linkActivatedAt.getTime(),
      input.projectionAsOf.getTime() - VSI_DISCOVERY_CH_HISTORY_DAYS * 24 * 3600 * 1000,
    ),
  );
  const evaluatedWindowEnd = input.projectionAsOf;
  const base = emptyNativeSignalDiscoveryInventory(scope, evaluatedWindowEnd);
  const profileLimitations = [...base.profileLimitations];

  if (!input.clickHouseHf) {
    profileLimitations.push(VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_DISABLED_OR_EMPTY);
    return {
      ...base,
      profileLimitations,
      entries: [],
    };
  }

  const trips = await prisma.vehicleTrip.findMany({
    where: {
      vehicleId: input.vehicleId,
      vehicle: { organizationId: input.organizationId },
      tripStatus: TripStatus.COMPLETED,
      endTime: { not: null, gte: evaluatedWindowStart, lte: evaluatedWindowEnd },
      startTime: { lte: evaluatedWindowEnd },
    },
    orderBy: { endTime: 'desc' },
    take: VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS,
    select: { id: true, startTime: true, endTime: true },
  });

  const linkHistory = await prisma.vehicleDataSourceLink.findMany({
    where: { vehicleId: input.vehicleId },
    select: { id: true, activatedAt: true, deactivatedAt: true, provider: true },
  });
  const linkIntervals: VsiSourceLinkIntervalV1[] = linkHistory.map((row) => ({
    id: row.id,
    activatedAtMs: row.activatedAt.getTime(),
    deactivatedAtMs: row.deactivatedAt?.getTime() ?? null,
  }));

  const targetLink = linkHistory.find((l) => l.id === input.providerSourceLinkId);
  const requireTokenMatch = targetLink?.provider === 'DIMO';
  let expectedTokenId: number | null = null;
  if (requireTokenMatch) {
    const linkRow = await prisma.vehicleDataSourceLink.findFirst({
      where: { id: input.providerSourceLinkId, vehicleId: input.vehicleId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    expectedTokenId = linkRow?.dimoVehicle?.tokenId ?? null;
  }

  const tripWindows = clipTripWindowsToLinkBounds(
    trips
      .filter((t) => t.endTime != null)
      .map((t) => ({
        tripId: t.id,
        startMs: t.startTime.getTime(),
        endMs: t.endTime!.getTime(),
      })),
    input.linkActivatedAt.getTime(),
    input.linkDeactivatedAt?.getTime() ?? null,
  );

  const aggregates = new Map<string, SignalAggregate>();
  let hadAttributableTrips = false;
  let chUnavailable = false;
  let hadTripQueryFailure = false;
  let hadQueryTimeout = false;
  let attributionAmbiguous = false;
  let attributableTripCount = 0;
  let successfulAttributableTripQueryCount = 0;

  for (const trip of tripWindows) {
    const attribution = evaluateTripWindowSourceLinkAttributionV1({
      targetLinkId: input.providerSourceLinkId,
      links: linkIntervals,
      tripStartMs: trip.startMs,
      tripEndMs: trip.endMs,
    });
    if (!attribution.attributable) {
      if (attribution.limitation === VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW) {
        attributionAmbiguous = true;
      }
      continue;
    }
    hadAttributableTrips = true;
    attributableTripCount += 1;

    const read = await input.clickHouseHf.getVsiDiscoveryTripHfSignalAggregates({
      orgId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: trip.tripId,
      tripStart: new Date(trip.startMs),
      tripEnd: new Date(trip.endMs),
      maxSignals: VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS,
      expectedTokenId,
      requireTokenMatch: requireTokenMatch && expectedTokenId != null,
    });

    if (read.status === 'UNAVAILABLE') {
      chUnavailable = true;
      break;
    }
    if (read.tenantScopeViolation) {
      profileLimitations.push('HF_DISCOVERY_TENANT_SCOPE_VIOLATION');
      continue;
    }
    if (read.status === 'QUERY_FAILED') {
      hadTripQueryFailure = true;
      const degraded = (read as { degradedReason?: string }).degradedReason ?? '';
      if (/timeout/i.test(degraded)) {
        hadQueryTimeout = true;
      }
      for (const row of read.signals) {
        const agg =
          aggregates.get(row.signalName) ??
          ({
            pointCount: 0,
            firstSeenAt: null,
            lastSeenAt: null,
            tripCountWithPoints: 0,
            windowStartAt: null,
            windowEndAt: null,
            readCapApplied: VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
            attributionLimitations: new Set<string>(),
            queryFailed: true,
          } satisfies SignalAggregate);
        agg.queryFailed = true;
        aggregates.set(row.signalName, agg);
      }
      continue;
    }

    successfulAttributableTripQueryCount += 1;

    for (const row of read.signals) {
      if (
        !aggregates.has(row.signalName) &&
        aggregates.size >= VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS
      ) {
        profileLimitations.push(VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_SIGNAL_SET_BOUNDED);
        break;
      }
      const prev =
        aggregates.get(row.signalName) ??
        ({
          pointCount: 0,
          firstSeenAt: null,
          lastSeenAt: null,
          tripCountWithPoints: 0,
          windowStartAt: evaluatedWindowStart.toISOString(),
          windowEndAt: evaluatedWindowEnd.toISOString(),
          readCapApplied: VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
          attributionLimitations: new Set<string>(),
          queryFailed: false,
        } satisfies SignalAggregate);

      const nextCount = Math.min(
        VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
        prev.pointCount + row.pointCount,
      );
      if (prev.pointCount + row.pointCount > VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL) {
        profileLimitations.push(VsiNativeDiscoveryIngestionLimitation.HF_MIRROR_BOUNDED_WINDOW);
      }

      prev.pointCount = nextCount;
      if (row.pointCount > 0) {
        prev.tripCountWithPoints += 1;
      }
      if (row.firstSeenAtIso) {
        prev.firstSeenAt =
          prev.firstSeenAt == null || row.firstSeenAtIso < prev.firstSeenAt
            ? row.firstSeenAtIso
            : prev.firstSeenAt;
      }
      if (row.lastSeenAtIso) {
        prev.lastSeenAt =
          prev.lastSeenAt == null || row.lastSeenAtIso > prev.lastSeenAt
            ? row.lastSeenAtIso
            : prev.lastSeenAt;
      }
      aggregates.set(row.signalName, prev);
    }
  }

  if (hadTripQueryFailure) {
    profileLimitations.push('HF_DISCOVERY_TRIP_QUERY_FAILED');
  }

  const attributableQueriesComplete =
    attributableTripCount > 0 &&
    !chUnavailable &&
    !hadTripQueryFailure &&
    successfulAttributableTripQueryCount === attributableTripCount;

  const persistedByName = new Map<string, VsiNativeSignalDiscoveryInventoryEntryV1>();
  for (const entry of input.persistedInventory?.entries ?? []) {
    persistedByName.set(entry.providerNativeSignalName, entry);
  }

  const persistedNativeNames = [...persistedByName.keys()].sort((a, b) => a.localeCompare(b));
  const clickHouseNativeNames = [...aggregates.keys()];
  const union = selectUnionNativeSignalNamesForHfEvaluation({
    persistedNativeNames,
    clickHouseNativeNames,
  });
  const unionCapOmittedSet = new Set(union.omitted);

  const evaluationContext: VsiHfHistoricalEvaluationContextV1 = {
    evaluatedWindow: { start: evaluatedWindowStart, end: evaluatedWindowEnd },
    hadAttributableTrips,
    attributionAmbiguous,
    chUnavailable,
    hadTripQueryFailure,
    attributableTripQueryCount: successfulAttributableTripQueryCount,
    attributableQueriesComplete,
    unionCapOmitted: false,
    hadQueryTimeout,
  };

  const snapshotPlaceholder = buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis();
  const allUnionNames = [...union.selected, ...union.omitted].sort((a, b) =>
    a.localeCompare(b),
  );

  const entries = allUnionNames.map((nativeName) => {
    const alias = resolveNativeAliasVerdictForDiscovery(nativeName);
    const persistedEntry = persistedByName.get(nativeName);
    const aggregate = aggregates.get(nativeName);
    const unionCapOmitted = unionCapOmittedSet.has(nativeName);
    return {
      providerNativeSignalName: nativeName,
      aliasVerdict: persistedEntry?.aliasVerdict ?? alias.verdict,
      canonicalSignalKey: persistedEntry?.canonicalSignalKey ?? alias.canonicalSignalKey,
      snapshot: persistedEntry?.snapshot ?? snapshotPlaceholder,
      historical: buildHistoricalAxisForUnionNativeKey({
        nativeName,
        aggregate,
        context: { ...evaluationContext, unionCapOmitted },
      }),
      ingestionLimitations: aggregate
        ? [...aggregate.attributionLimitations]
        : (persistedEntry?.ingestionLimitations ?? []),
    };
  });

  return {
    ...base,
    entries,
    profileLimitations,
  };
}
