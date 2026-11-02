import type {
  VsiRpmCadenceTierResolutionV1,
  VsiRpmCadenceTierTripClassificationV1,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { VsiRpmCadenceTierLabel } from '../../vehicle-signal-intelligence/vsi-rpm-cadence-tier.types';
import {
  DS4_RPM_HF_TIER_TRIP_END_BINDING_TOLERANCE_MS,
  type Ds4RpmHfTierAnalysisMode,
  type Ds4RpmHfTierEvidenceStatus,
  type Ds4RpmHfTierEvidenceV1,
} from '../ds4-rpm-hf-tier-evidence.types';

export type Ds4RpmHfV1bResolvedTierEvidence = Ds4RpmHfTierEvidenceV1;

export { DS4_RPM_HF_TIER_TRIP_END_BINDING_TOLERANCE_MS as DS4_RPM_HF_V1B_TIER_TRIP_END_BINDING_TOLERANCE_MS };

export function resolveTripTierClassificationFromVsi(input: {
  tripId: string;
  tripClassifications: readonly VsiRpmCadenceTierTripClassificationV1[];
}): VsiRpmCadenceTierTripClassificationV1 | null {
  return input.tripClassifications.find((c) => c.tripId === input.tripId) ?? null;
}

export function resolveTierEvidenceForTrip(input: {
  tripId: string;
  tripEndIso: string;
  providerSourceLinkId: string | null;
  tierSnapshot: VsiRpmCadenceTierResolutionV1 | null;
  hfReadComplete: boolean;
  hfDataPresent: boolean;
}): Ds4RpmHfTierEvidenceV1 {
  const base = {
    contractVersion: 'ds4-rpm-hf-tier-evidence-v1' as const,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    tripClassification: null as VsiRpmCadenceTierTripClassificationV1 | null,
    blockEvidenceObservedAt: input.tierSnapshot?.evidenceObservedAt ?? null,
  };

  if (!input.hfReadComplete || !input.hfDataPresent) {
    return { ...base, status: 'HF_EVIDENCE_INCOMPLETE' };
  }

  const row = input.tierSnapshot
    ? resolveTripTierClassificationFromVsi({
        tripId: input.tripId,
        tripClassifications: input.tierSnapshot.tripClassifications ?? [],
      })
    : null;

  if (!row) {
    return { ...base, status: 'MISSING_ROW' };
  }

  const tripEndMs = Date.parse(input.tripEndIso);
  if (!Number.isFinite(tripEndMs)) {
    return { ...base, status: 'STALE_TRIP_BINDING', tripClassification: row };
  }

  if (Math.abs(row.endMs - tripEndMs) > DS4_RPM_HF_TIER_TRIP_END_BINDING_TOLERANCE_MS) {
    return { ...base, status: 'STALE_TRIP_BINDING', tripClassification: row };
  }

  return {
    ...base,
    status: 'AVAILABLE',
    tripClassification: row,
  };
}

export function resolveTierAwareAnalysisMode(input: {
  tier: VsiRpmCadenceTierLabel;
  cadenceConfidence: VsiRpmCadenceTierTripClassificationV1['cadenceConfidence'];
  tripCoverageBand: VsiRpmCadenceTierTripClassificationV1['tripCoverageBand'];
  analysisReadiness: VsiRpmCadenceTierTripClassificationV1['analysisReadiness'];
}): Ds4RpmHfTierAnalysisMode | null {
  if (input.tier === 'SPARSE' || input.tier === 'UNKNOWN') {
    return null;
  }
  if (input.tier === 'RPM_3S') {
    return 'OBSERVATION_ONLY';
  }
  if (input.analysisReadiness === 'NOT_READY') {
    return null;
  }
  if (input.cadenceConfidence === 'LOW') {
    return null;
  }
  if (input.tripCoverageBand === 'MINIMAL_SPAN') {
    return null;
  }
  if (input.tier === 'RPM_1S') {
    if (
      input.analysisReadiness === 'LIMITED_TRIP' ||
      input.analysisReadiness === 'TIER_ANALYTICS_OK' ||
      input.analysisReadiness === 'ACTIVE_SPAN_ONLY'
    ) {
      return input.analysisReadiness === 'ACTIVE_SPAN_ONLY' ? 'OBSERVATION_ONLY' : 'HIGH_RESOLUTION';
    }
    return null;
  }
  if (input.tier === 'RPM_2S') {
    if (
      input.analysisReadiness === 'LIMITED_TRIP' ||
      input.analysisReadiness === 'TIER_ANALYTICS_OK' ||
      input.analysisReadiness === 'ACTIVE_SPAN_ONLY'
    ) {
      return input.analysisReadiness === 'ACTIVE_SPAN_ONLY' ? 'OBSERVATION_ONLY' : 'CADENCE_AWARE';
    }
    return null;
  }
  return null;
}

export function tierEvidenceDeferReasonCode(status: Ds4RpmHfTierEvidenceStatus): string {
  switch (status) {
    case 'MISSING_ROW':
      return 'TRIP_RPM_TIER_EVIDENCE_MISSING';
    case 'STALE_TRIP_BINDING':
      return 'TRIP_RPM_TIER_EVIDENCE_STALE';
    case 'HF_EVIDENCE_INCOMPLETE':
      return 'HF_RPM_TIER_EVIDENCE_INCOMPLETE';
    default:
      return 'TRIP_RPM_TIER_EVIDENCE_MISSING';
  }
}
