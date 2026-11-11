import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import {
  DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY,
  DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS,
  DS4_RPM_V1B_RESEARCH_REPORTING_CONTRACT_VERSION,
  type Ds4RpmV1bResearchRpmReportV1,
  type Ds4RpmV1bResearchTierReportingV1,
} from './ds4-rpm-v1b-research-reporting.contract.v1';

export type Ds4RpmV1bResearchSummaryPairV1 = {
  legacy: Ds4RpmHfV1bShadowResultV1;
  tierAware: Ds4RpmHfV1bShadowResultV1 | null;
  telemetrySourceFamily?: 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN';
};

const UNVERIFIED = 'UNVERIFIED' as const;

function tripBindFields(row: Ds4RpmHfV1bShadowResultV1) {
  return {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    tripId: row.tripId,
    providerSourceLinkId: row.providerSourceLinkId ?? null,
  };
}

export function verifyDs4RpmV1bResearchSummaryBindingsV1(
  legacy: Ds4RpmHfV1bShadowResultV1,
  tierAware: Ds4RpmHfV1bShadowResultV1 | null,
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (legacy.shadowVariant !== 'legacy') {
    reasons.push('LEGACY_ROW_NOT_LEGACY_VARIANT');
  }
  if (tierAware == null) {
    reasons.push('TIER_AWARE_ROW_MISSING');
    return { ok: false, reasons };
  }
  if (tierAware.shadowVariant !== 'tier-aware') {
    reasons.push('TIER_AWARE_ROW_NOT_TIER_AWARE_VARIANT');
  }
  const a = tripBindFields(legacy);
  const b = tripBindFields(tierAware);
  if (a.organizationId !== b.organizationId) reasons.push('ORG_MISMATCH');
  if (a.vehicleId !== b.vehicleId) reasons.push('VEHICLE_MISMATCH');
  if (a.tripId !== b.tripId) reasons.push('TRIP_MISMATCH');
  if (
    a.providerSourceLinkId != null &&
    b.providerSourceLinkId != null &&
    a.providerSourceLinkId !== b.providerSourceLinkId
  ) {
    reasons.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }
  if (legacy.processingOutcome !== 'SUCCEEDED') {
    reasons.push('LEGACY_NOT_SUCCEEDED');
  }
  if (tierAware.processingOutcome !== 'SUCCEEDED') {
    reasons.push('TIER_AWARE_NOT_SUCCEEDED');
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function extractTripTimeObservationDensityV1(
  legacy: Ds4RpmHfV1bShadowResultV1,
): number | null {
  return legacy.temporalCoverage.observedBucketCoverageRatio ?? null;
}

export function deriveUnknownGapCauseLabelsV1(
  legacy: Ds4RpmHfV1bShadowResultV1,
): string[] {
  const causes: string[] = [];
  const policy = legacy.temporalCoverage.gapInterpretationPolicy;
  if (policy === 'MISSING_DATA_NOT_ENGINE_OFF') {
    causes.push('RPM_SILENCE_NOT_INFERRED_AS_ENGINE_OFF');
  }
  const ist = legacy.intervalStats;
  if ((ist.gapCountOver2Seconds ?? 0) > 0) {
    causes.push('OBSERVED_RPM_SEQUENCE_GAP');
  }
  if (
    ist.longestObservedGapSeconds != null &&
    ist.longestObservedGapSeconds > legacy.sequenceStats.sequenceGapRuleSeconds
  ) {
    causes.push('UNEXPLAINED_LONG_INTER_OBSERVATION_GAP');
  }
  if (causes.length === 0) {
    causes.push('UNKNOWN_OR_MIXED');
  }
  return [...new Set(causes)];
}

function buildTierReporting(
  legacy: Ds4RpmHfV1bShadowResultV1,
  tierAware: Ds4RpmHfV1bShadowResultV1 | null,
): Ds4RpmV1bResearchTierReportingV1 {
  const binding = verifyDs4RpmV1bResearchSummaryBindingsV1(legacy, tierAware);
  const base: Ds4RpmV1bResearchTierReportingV1 = {
    tierEvidenceVerification: 'UNVERIFIED',
    cadenceTier: UNVERIFIED,
    cadenceConfidence: UNVERIFIED,
    analysisReadiness: UNVERIFIED,
    tripCoverageBand: UNVERIFIED,
    tierAvailability: UNVERIFIED,
    legacyShadowVariant: legacy.shadowVariant,
    tierAwareShadowVariant: tierAware?.shadowVariant ?? UNVERIFIED,
    tierEvidenceDecisionCode: UNVERIFIED,
  };
  if (!binding.ok || tierAware == null) {
    return base;
  }
  const te = tierAware.tierEvidence;
  if (te == null || te.availability !== 'AVAILABLE' || te.tier == null) {
    return base;
  }
  return {
    tierEvidenceVerification: 'VERIFIED',
    cadenceTier: te.tier,
    cadenceConfidence: te.cadenceConfidence ?? UNVERIFIED,
    analysisReadiness: te.analysisReadiness ?? UNVERIFIED,
    tripCoverageBand: te.tripCoverageBand ?? UNVERIFIED,
    tierAvailability: te.availability,
    legacyShadowVariant: legacy.shadowVariant,
    tierAwareShadowVariant: tierAware.shadowVariant,
    tierEvidenceDecisionCode: te.decisionCode ?? UNVERIFIED,
  };
}

/**
 * DBI research reporting — never maps trip-time observation density to poll success or tier readiness.
 * Tier fields come only from verified tier-aware tierEvidence; legacy qualityExposure.cadenceTier is ignored.
 */
export function buildDs4RpmV1bResearchRpmReportV1(
  input: Ds4RpmV1bResearchSummaryPairV1,
): Ds4RpmV1bResearchRpmReportV1 {
  const { legacy, tierAware, telemetrySourceFamily } = input;
  const vsi = legacy.vsiTripClassification;
  return {
    contractVersion: DS4_RPM_V1B_RESEARCH_REPORTING_CONTRACT_VERSION,
    organizationId: legacy.organizationId,
    vehicleId: legacy.vehicleId,
    tripId: legacy.tripId,
    providerSourceLinkId: legacy.providerSourceLinkId,
    vsiTripProfile: vsi?.tripRpmProfile ?? UNVERIFIED,
    vsiVehicleProfile: vsi?.vehicleActiveRpmProfile ?? UNVERIFIED,
    tripTimeObservationDensity: extractTripTimeObservationDensityV1(legacy),
    tripTimeObservationDensitySemantics: DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS,
    pollSuccessVerdict: DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY,
    tierReporting: buildTierReporting(legacy, tierAware),
    unknownGapCause: deriveUnknownGapCauseLabelsV1(legacy),
    r1TemporalVeto: telemetrySourceFamily === 'RUPTELA_R1' ? 'ACTIVE' : 'NOT_APPLICABLE',
    crossDomainTimestampFusion: 'FORBIDDEN',
  };
}
