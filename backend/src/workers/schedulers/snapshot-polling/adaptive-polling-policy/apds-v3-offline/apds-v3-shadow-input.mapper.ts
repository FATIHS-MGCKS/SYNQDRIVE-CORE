import type { TripDetectionState } from '@prisma/client';
import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import { evaluateP25ApdProfile } from '../p25-apd-profile-evaluator';
import { evaluateOfflineBaselineEligibilityFromPolicyInput } from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';
import { APDS_V3_BASELINE_AUTHORITY } from './apds-v3-baseline-poll-due.adapter';

export type ApdsV3ShadowPollStartContext = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  pollStartedAtMs: number;
  tripDetectionState: TripDetectionState | null;
  lastProviderFetchedAtMs: number | null;
  lastTrustworthyLvSourceMs: number | null;
  lvProviderTimestampsMs: number[];
  providerGapOpen: boolean;
  r9WakeKnown: boolean;
  deviceReconnectRecent: boolean;
  providerReconnectRecent: boolean;
  vehicleFuelType: string | null;
  activityTierLabel: string;
  p2cObservationId?: string | null;
  p2cObservationAvailableAtMs?: number | null;
  p2cBoundOrganizationId?: string | null;
  p2cBoundVehicleId?: string | null;
  p2cBoundProviderSourceLinkId?: string | null;
  p2cDataSourceTimestampMs?: number | null;
  p2cTopLevelAdvanceKnown?: boolean;
  p2cObservationCoverageVerified?: boolean;
  signalProfileRevision?: string | null;
  signalProfileRevisionEffectiveAtMs?: number | null;
};

function mapTripFsm(
  state: TripDetectionState | null,
): ApdsV3OfflinePolicyInput['tripFsmState'] {
  if (state == null) return 'UNKNOWN';
  if (
    state === 'ACTIVE_TRIP' ||
    state === 'IDLE_WITHIN_TRIP' ||
    state === 'POSSIBLE_END'
  ) {
    return 'ACTIVE';
  }
  return 'RESTING';
}

export function mapApdsV3ShadowPollStartToOfflineInput(
  ctx: ApdsV3ShadowPollStartContext,
): {
  input: ApdsV3OfflinePolicyInput;
  profileClass: string;
  profileVersion: string;
} {
  const tripActive = mapTripFsm(ctx.tripDetectionState) === 'ACTIVE';
  const profile = evaluateP25ApdProfile({
    nowMs: ctx.pollStartedAtMs,
    lvProviderTimestampsMs: ctx.lvProviderTimestampsMs,
    vehicleFuelType: ctx.vehicleFuelType,
    providerGapOpen: ctx.providerGapOpen,
    tripActive,
    r9WakeRecent: ctx.r9WakeKnown,
    deviceReconnectRecent: ctx.deviceReconnectRecent,
    providerReconnectRecent: ctx.providerReconnectRecent,
    earlyAdvanceDetected: false,
    lateAdvanceDetected: false,
    phaseDriftDetected: false,
    capabilityChanged: false,
  });

  const input: ApdsV3OfflinePolicyInput = {
    organizationId: ctx.organizationId,
    vehicleId: ctx.vehicleId,
    providerSourceLinkId: ctx.providerSourceLinkId,
    decisionAtMs: ctx.pollStartedAtMs,
    reconciliation: !tripActive,
    tripFsmState: mapTripFsm(ctx.tripDetectionState),
    activityTier: ctx.activityTierLabel,
    lastPhysicalPollMs: null,
    lastLvProviderSourceMs: ctx.lastTrustworthyLvSourceMs,
    lastProviderFetchedAtMs: ctx.lastProviderFetchedAtMs,
    lastTopLevelProviderSourceMs: null,
    profileClass: profile.profileClass,
    medianIntervalMs: profile.medianCadenceMs,
    providerGapOpen: ctx.providerGapOpen,
    providerWakeOrReconnect: ctx.r9WakeKnown,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: ctx.p2cTopLevelAdvanceKnown ?? false,
    p2cObservationId: ctx.p2cObservationId ?? null,
    p2cObservationAvailableAtMs: ctx.p2cObservationAvailableAtMs ?? null,
    p2cBoundOrganizationId: ctx.p2cBoundOrganizationId ?? null,
    p2cBoundVehicleId: ctx.p2cBoundVehicleId ?? null,
    p2cBoundProviderSourceLinkId: ctx.p2cBoundProviderSourceLinkId ?? null,
    p2cDataSourceTimestampMs: ctx.p2cDataSourceTimestampMs ?? null,
    p2cObservationCoverageVerified: ctx.p2cObservationCoverageVerified,
    consumerDemandRevision: APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
    signalProfileRevision: ctx.signalProfileRevision ?? null,
    signalProfileRevisionEffectiveAtMs: ctx.signalProfileRevisionEffectiveAtMs ?? null,
  };

  return {
    input,
    profileClass: profile.profileClass,
    profileVersion: profile.profileVersion,
  };
}

export function resolveBaselinePartialParitySnapshot(input: ApdsV3OfflinePolicyInput): {
  baselineCanonicalDue: boolean | null;
  baselineAuthority: string;
  baselineAssessable: boolean;
} {
  const elig = evaluateOfflineBaselineEligibilityFromPolicyInput(input);
  if (!elig.assessable) {
    return {
      baselineCanonicalDue: null,
      baselineAuthority: APDS_V3_BASELINE_AUTHORITY,
      baselineAssessable: false,
    };
  }
  return {
    baselineCanonicalDue: elig.canonicalDue,
    baselineAuthority: elig.authority,
    baselineAssessable: true,
  };
}
