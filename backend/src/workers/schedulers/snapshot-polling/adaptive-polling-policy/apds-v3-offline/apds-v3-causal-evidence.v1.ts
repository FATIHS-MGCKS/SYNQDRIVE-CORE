import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

export type CausalEvidenceVerdict =
  | { ok: true; observationQuality: 'HIGH' | 'LOW' | 'UNKNOWN' }
  | { ok: false; kind: 'NOT_ASSESSABLE' | 'INSUFFICIENT_EVIDENCE'; reason: string };

function isFiniteMs(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && !Number.isNaN(v);
}

function atOrBefore(decisionAtMs: number, ts: number | null | undefined): boolean {
  return ts != null && Number.isFinite(ts) && ts <= decisionAtMs;
}

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates causally available evidence at decisionAtMs.
 * Does not assume cross-signal-group timestamp ordering.
 */
export function validateCausalEvidenceAtDecision(
  input: ApdsV3OfflinePolicyInput,
): CausalEvidenceVerdict {
  if (!isFiniteMs(input.decisionAtMs)) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'DECISION_AT_INVALID' };
  }

  const timestamps = [
    input.lastLvProviderSourceMs,
    input.lastProviderFetchedAtMs,
    input.lastTopLevelProviderSourceMs,
    input.lastPhysicalPollMs,
    input.lastObservedAtMs ?? null,
    input.signalProfileRevisionEffectiveAtMs ?? null,
    input.p2cObservationAvailableAtMs ?? null,
    input.p2cDataSourceTimestampMs ?? null,
    input.lvStrictSourceAdvanceObservedAtMs ?? null,
  ];

  for (const ts of timestamps) {
    if (ts != null && (!Number.isFinite(ts) || Number.isNaN(ts))) {
      return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'NON_FINITE_TIMESTAMP' };
    }
    if (ts != null && ts > input.decisionAtMs) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'FUTURE_TIMESTAMP_LEAK' };
    }
  }

  if (
    input.medianIntervalMs != null &&
    (!Number.isFinite(input.medianIntervalMs) || input.medianIntervalMs <= 0)
  ) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'MEDIAN_INTERVAL_INVALID' };
  }

  if (input.consumerDemandRevision !== APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'CONSUMER_REGISTRY_VERSION_MISMATCH' };
  }

  if (input.providerSourceLinkId == null && input.sourceLinkInvalidated) {
    return { ok: false, kind: 'NOT_ASSESSABLE', reason: 'SOURCE_LINK_INCOHERENT' };
  }

  if (input.p2cTopLevelAdvanceKnown) {
    if (!nonEmpty(input.p2cObservationId)) {
      return {
        ok: false,
        kind: 'INSUFFICIENT_EVIDENCE',
        reason: 'P2C_CLAIM_WITHOUT_OBSERVATION_ID',
      };
    }
    if (!atOrBefore(input.decisionAtMs, input.p2cObservationAvailableAtMs)) {
      return {
        ok: false,
        kind: 'INSUFFICIENT_EVIDENCE',
        reason: 'P2C_OBSERVATION_NOT_AVAILABLE_AT_DECISION',
      };
    }
    if (!atOrBefore(input.decisionAtMs, input.p2cDataSourceTimestampMs)) {
      return {
        ok: false,
        kind: 'INSUFFICIENT_EVIDENCE',
        reason: 'P2C_DATA_SOURCE_TIMESTAMP_UNAVAILABLE',
      };
    }
    if (!nonEmpty(input.p2cBoundOrganizationId)) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'P2C_ORG_BINDING_MISSING' };
    }
    if (input.p2cBoundOrganizationId !== input.organizationId) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'P2C_ORG_BINDING_MISMATCH' };
    }
    if (!nonEmpty(input.p2cBoundVehicleId)) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'P2C_VEHICLE_BINDING_MISSING' };
    }
    if (input.p2cBoundVehicleId !== input.vehicleId) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'P2C_VEHICLE_BINDING_MISMATCH' };
    }
    if (!nonEmpty(input.p2cBoundProviderSourceLinkId)) {
      return {
        ok: false,
        kind: 'INSUFFICIENT_EVIDENCE',
        reason: 'P2C_SOURCE_LINK_BINDING_MISSING',
      };
    }
    if (!nonEmpty(input.providerSourceLinkId)) {
      return {
        ok: false,
        kind: 'INSUFFICIENT_EVIDENCE',
        reason: 'P2C_DECISION_SOURCE_LINK_MISSING',
      };
    }
    if (input.p2cBoundProviderSourceLinkId !== input.providerSourceLinkId) {
      return { ok: false, kind: 'INSUFFICIENT_EVIDENCE', reason: 'P2C_SOURCE_LINK_BINDING_MISMATCH' };
    }
  }

  let observationQuality: 'HIGH' | 'LOW' | 'UNKNOWN' = 'UNKNOWN';
  if (input.signalProfileRevision) {
    const effective = input.signalProfileRevisionEffectiveAtMs;
    if (effective == null || effective > input.decisionAtMs) {
      observationQuality = 'UNKNOWN';
    } else if (
      nonEmpty(input.p2cObservationId) &&
      atOrBefore(input.decisionAtMs, input.p2cObservationAvailableAtMs) &&
      input.p2cObservationCoverageVerified === true &&
      nonEmpty(input.p2cBoundOrganizationId) &&
      input.p2cBoundOrganizationId === input.organizationId &&
      nonEmpty(input.p2cBoundVehicleId) &&
      input.p2cBoundVehicleId === input.vehicleId &&
      nonEmpty(input.p2cBoundProviderSourceLinkId) &&
      nonEmpty(input.providerSourceLinkId) &&
      input.p2cBoundProviderSourceLinkId === input.providerSourceLinkId
    ) {
      observationQuality = 'HIGH';
    } else if (nonEmpty(input.p2cObservationId)) {
      observationQuality = 'LOW';
    } else {
      observationQuality = 'UNKNOWN';
    }
  }

  return { ok: true, observationQuality };
}
