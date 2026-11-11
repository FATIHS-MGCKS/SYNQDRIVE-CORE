/**
 * VPS/offline research exporter companion — mirror of ds4-rpm-v1b-research-reporting.v1.ts
 */

const UNVERIFIED = 'UNVERIFIED';
export const TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS =
  'FULL_TRIP_ONE_SECOND_BUCKET_DENSITY_NOT_POLL_SUCCESS';

function tripBindFields(row) {
  return {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    tripId: row.tripId,
    providerSourceLinkId: row.providerSourceLinkId ?? null,
  };
}

export function verifyV1bResearchBindings(legacy, tierAware) {
  const reasons = [];
  if (legacy.shadowVariant !== 'legacy') reasons.push('LEGACY_ROW_NOT_LEGACY_VARIANT');
  if (tierAware == null) {
    reasons.push('TIER_AWARE_ROW_MISSING');
    return { ok: false, reasons };
  }
  if (tierAware.shadowVariant !== 'tier-aware') reasons.push('TIER_AWARE_ROW_NOT_TIER_AWARE_VARIANT');
  const a = tripBindFields(legacy);
  const b = tripBindFields(tierAware);
  if (a.organizationId !== b.organizationId) reasons.push('ORG_MISMATCH');
  if (a.vehicleId !== b.vehicleId) reasons.push('VEHICLE_MISMATCH');
  if (a.tripId !== b.tripId) reasons.push('TRIP_MISMATCH');
  if (a.providerSourceLinkId == null || b.providerSourceLinkId == null) {
    reasons.push('PROVIDER_SOURCE_LINK_MISSING');
  } else if (a.providerSourceLinkId !== b.providerSourceLinkId) {
    reasons.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }
  if (legacy.processingOutcome !== 'SUCCEEDED') reasons.push('LEGACY_NOT_SUCCEEDED');
  if (tierAware.processingOutcome !== 'SUCCEEDED') reasons.push('TIER_AWARE_NOT_SUCCEEDED');
  const te = tierAware.tierEvidence;
  if (te != null && te.tripId !== legacy.tripId) reasons.push('TIER_EVIDENCE_TRIP_ID_MISMATCH');
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function resolveTierEvidenceProvenance(tierAware, explicit) {
  if (explicit === 'RECONSTRUCTED_OFFLINE') return 'RECONSTRUCTED_OFFLINE';
  if (tierAware == null) return explicit ?? 'NOT_PROVIDED';
  return 'PERSISTED_V1B_PAIR';
}

export function buildV1bResearchRpmReport({
  legacy,
  tierAware,
  telemetrySourceFamily,
  tierEvidenceProvenance: explicitProv,
}) {
  const vsi = legacy.vsiTripClassification ?? {};
  const tierEvidenceProvenance = resolveTierEvidenceProvenance(tierAware, explicitProv);
  const binding = verifyV1bResearchBindings(legacy, tierAware);
  let tierReporting = {
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
  const te = tierAware?.tierEvidence;
  const mayVerify =
    binding.ok &&
    tierAware != null &&
    tierEvidenceProvenance === 'PERSISTED_V1B_PAIR' &&
    te?.availability === 'AVAILABLE' &&
    te?.tier != null &&
    te.tripId === legacy.tripId;
  if (mayVerify) {
    tierReporting = {
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
  const gapCauses = ['RPM_SILENCE_NOT_INFERRED_AS_ENGINE_OFF'];
  const ist = legacy.intervalStats ?? {};
  if ((ist.gapCountOver2Seconds ?? 0) > 0) gapCauses.push('OBSERVED_RPM_SEQUENCE_GAP');
  if (
    ist.longestObservedGapSeconds != null &&
    ist.longestObservedGapSeconds > (legacy.sequenceStats?.sequenceGapRuleSeconds ?? 2)
  ) {
    gapCauses.push('UNEXPLAINED_LONG_INTER_OBSERVATION_GAP');
  }
  return {
    contractVersion: 'ds4-rpm-v1b-research-reporting-v1',
    organizationId: legacy.organizationId,
    vehicleId: legacy.vehicleId,
    tripId: legacy.tripId,
    providerSourceLinkId: legacy.providerSourceLinkId ?? null,
    vsiTripProfile: vsi.tripRpmProfile ?? UNVERIFIED,
    vsiVehicleProfile: vsi.vehicleActiveRpmProfile ?? UNVERIFIED,
    tripTimeObservationDensity: legacy.temporalCoverage?.observedBucketCoverageRatio ?? null,
    tripTimeObservationDensitySemantics: TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS,
    pollSuccessVerdict: 'NOT_DERIVED_FROM_TRIP_TIME_OBSERVATION_DENSITY',
    tierEvidenceProvenance,
    tierReporting,
    unknownGapCause: [...new Set(gapCauses)],
    r1TemporalVeto: telemetrySourceFamily === 'RUPTELA_R1' ? 'ACTIVE' : 'NOT_APPLICABLE',
    crossDomainTimestampFusion: 'FORBIDDEN',
  };
}

export function buildLegacyDescriptiveStats(summary) {
  const rv = summary.rpmValues ?? {};
  const tc = summary.temporalCoverage ?? {};
  const ist = summary.intervalStats ?? {};
  const seq = summary.sequenceStats ?? {};
  const rc = summary.readCompleteness ?? {};
  return {
    observationCount: rv.validPointCount ?? null,
    intervalMedianSeconds: ist.medianIntervalSeconds ?? null,
    intervalP95Seconds: ist.p95IntervalSeconds ?? null,
    longestGapSeconds: ist.longestObservedGapSeconds ?? null,
    continuousSequenceCount: seq.continuousSequenceCount ?? null,
    longestContinuousSequenceSeconds: seq.longestContinuousSequenceSeconds ?? null,
    /** @deprecated use researchRpmReport.tripTimeObservationDensity */
    tripTimeObservationDensity: tc.observedBucketCoverageRatio ?? null,
    readCompleteness: rc,
    pointLevelPersisted: Boolean(summary.rpmPoints?.length || summary.points?.length),
  };
}
