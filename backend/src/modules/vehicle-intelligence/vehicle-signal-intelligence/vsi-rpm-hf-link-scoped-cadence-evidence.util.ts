import type { HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import { VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN } from './vsi-engine-rpm-combined-evidence-v1.util';
import type {
  VsiHfCadenceReadStatus,
  VsiRpmCadenceSamplePoint,
  VsiRpmCadenceTripWindow,
} from './vsi-profile-cadence.types';

export const VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW =
  'RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW' as const;

export const VSI_RPM_HF_DEVICE_TOKEN_UNRESOLVED = 'RPM_HF_DEVICE_TOKEN_UNRESOLVED' as const;

export type VsiSourceLinkIntervalV1 = {
  id: string;
  activatedAtMs: number;
  deactivatedAtMs: number | null;
};

export type VsiRpmHfTripReadPortV1 = {
  getTripRpmHfPoints(input: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    tripStart: Date;
    tripEnd: Date;
    limit?: number;
  }): Promise<HfTripRpmPointsReadResult>;
};

export function sourceLinksCoveringInterval(
  links: readonly VsiSourceLinkIntervalV1[],
  startMs: number,
  endMs: number,
): VsiSourceLinkIntervalV1[] {
  return links.filter((link) => {
    const linkEnd = link.deactivatedAtMs ?? Number.POSITIVE_INFINITY;
    return link.activatedAtMs <= endMs && linkEnd >= startMs;
  });
}

/** Fail-closed when more than one link lifecycle covers the (clipped) trip window. */
export function evaluateTripWindowSourceLinkAttributionV1(input: {
  targetLinkId: string;
  links: readonly VsiSourceLinkIntervalV1[];
  tripStartMs: number;
  tripEndMs: number;
}): { attributable: boolean; limitation?: string } {
  const covering = sourceLinksCoveringInterval(input.links, input.tripStartMs, input.tripEndMs);
  if (covering.length === 0) {
    return { attributable: false, limitation: VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN };
  }
  if (covering.length > 1) {
    return { attributable: false, limitation: VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW };
  }
  if (covering[0]!.id !== input.targetLinkId) {
    return { attributable: false, limitation: VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN };
  }
  return { attributable: true };
}

export async function loadLinkScopedRpmHfCadencePointsV1(input: {
  organizationId: string;
  vehicleId: string;
  targetLinkId: string;
  linkIntervals: readonly VsiSourceLinkIntervalV1[];
  tripWindows: readonly VsiRpmCadenceTripWindow[];
  expectedDimoTokenId: number | null;
  requireDimoToken: boolean;
  hf: VsiRpmHfTripReadPortV1;
  maxPoints: number;
}): Promise<{
  points: VsiRpmCadenceSamplePoint[];
  hfReadStatus: VsiHfCadenceReadStatus;
  attributionLimitations: string[];
}> {
  const attributionLimitations: string[] = [];

  if (input.requireDimoToken && input.expectedDimoTokenId == null) {
    attributionLimitations.push(VSI_RPM_HF_DEVICE_TOKEN_UNRESOLVED);
    attributionLimitations.push(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
    return { points: [], hfReadStatus: 'EMPTY', attributionLimitations };
  }

  if (input.tripWindows.length === 0) {
    return { points: [], hfReadStatus: 'EMPTY', attributionLimitations };
  }

  const points: VsiRpmCadenceSamplePoint[] = [];
  let remaining = input.maxPoints;
  let attributableTripCount = 0;
  let readAttempted = false;
  let hadQueryFailure = false;
  let hadTenantViolation = false;
  let rejectedTokenMismatch = 0;

  for (const trip of input.tripWindows) {
    if (remaining <= 0) {
      break;
    }

    const attribution = evaluateTripWindowSourceLinkAttributionV1({
      targetLinkId: input.targetLinkId,
      links: input.linkIntervals,
      tripStartMs: trip.startMs,
      tripEndMs: trip.endMs,
    });
    if (!attribution.attributable) {
      if (attribution.limitation) {
        attributionLimitations.push(attribution.limitation);
      }
      continue;
    }

    attributableTripCount += 1;
    readAttempted = true;

    const read = await input.hf.getTripRpmHfPoints({
      orgId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: trip.tripId,
      tripStart: new Date(trip.startMs),
      tripEnd: new Date(trip.endMs),
      limit: remaining,
    });

    if (read.status === 'TENANT_SCOPE_VIOLATION') {
      hadTenantViolation = true;
      attributionLimitations.push(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
      continue;
    }
    if (read.status === 'QUERY_FAILED' || read.status === 'UNAVAILABLE') {
      hadQueryFailure = true;
      continue;
    }
    if (read.status === 'EMPTY') {
      continue;
    }

    for (const row of read.points) {
      if (input.expectedDimoTokenId != null) {
        const tokenId = row.tokenId;
        if (tokenId != null && tokenId !== input.expectedDimoTokenId) {
          rejectedTokenMismatch += 1;
          continue;
        }
      }
      points.push({
        recordedAtMs: row.recordedAtMs,
        value: row.valueRpm,
        tripId: trip.tripId,
      });
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }
  }

  if (rejectedTokenMismatch > 0) {
    attributionLimitations.push(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  }
  if (hadTenantViolation) {
    attributionLimitations.push(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  }

  const uniqueLimitations = [...new Set(attributionLimitations)];

  if (attributableTripCount === 0) {
    return {
      points: [],
      hfReadStatus: 'EMPTY',
      attributionLimitations:
        uniqueLimitations.length > 0
          ? uniqueLimitations
          : [VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN],
    };
  }

  if (points.length === 0) {
    if (hadQueryFailure) {
      return { points: [], hfReadStatus: 'QUERY_FAILED', attributionLimitations: uniqueLimitations };
    }
    if (readAttempted) {
      return { points: [], hfReadStatus: 'EMPTY', attributionLimitations: uniqueLimitations };
    }
  }

  if (uniqueLimitations.length > 0 && points.length === 0) {
    return { points: [], hfReadStatus: 'EMPTY', attributionLimitations: uniqueLimitations };
  }

  return {
    points,
    hfReadStatus: points.length > 0 ? 'SUCCESS' : 'EMPTY',
    attributionLimitations: uniqueLimitations,
  };
}
