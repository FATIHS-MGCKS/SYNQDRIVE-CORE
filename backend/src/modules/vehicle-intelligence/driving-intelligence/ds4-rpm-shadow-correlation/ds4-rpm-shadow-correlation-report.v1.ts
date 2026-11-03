import type {
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationCohortReportV1,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationProvenanceManifestV1,
  Ds4RpmShadowCorrelationTripLevelReferenceBandV1,
  Ds4RpmShadowCorrelationTripReportV1,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION } from './ds4-rpm-shadow-correlation-v1.contract';
import { DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE } from './ds4-rpm-shadow-correlation-event-temporal-support.v1';

export const DS4_RPM_SHADOW_CORRELATION_V1B_FINGERPRINT_RECOMPUTE_METHOD =
  'computeDs4RpmHfV1bTierAwareInputFingerprint(Ds4RpmHfV1aTripInputV1)';

export const DS4_RPM_SHADOW_CORRELATION_NEGATIVE_CONTROL_SCENARIO_IDS = [
  'TENANT_MISMATCH_NEGATIVE',
  'RPM_TIMESTAMP_SHIFT_NEGATIVE',
] as const;

export function buildDs4RpmShadowCorrelationProvenanceManifest(input: {
  codeSha: string;
  generatedAt: Date;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  motionRunId: string;
  motionSnapshotHashAttested: string | null;
  v1bRunId: string | null;
  v1bInputFingerprint: string | null;
  rpmSampleInputFingerprint: string | null;
  rpmSampleSource: string | null;
  v1bEngineVersion: string | null;
  omissions: string[];
  unknowns: string[];
}): Ds4RpmShadowCorrelationProvenanceManifestV1 {
  return {
    codeSha: input.codeSha,
    generatedAtIso: input.generatedAt.toISOString(),
    evidenceKind: input.evidenceKind,
    motionRunId: input.motionRunId,
    motionSnapshotHashAttested: input.motionSnapshotHashAttested,
    v1bRunId: input.v1bRunId,
    v1bInputFingerprint: input.v1bInputFingerprint,
    v1bInputFingerprintRecomputeMethod: input.v1bRunId
      ? DS4_RPM_SHADOW_CORRELATION_V1B_FINGERPRINT_RECOMPUTE_METHOD
      : null,
    rpmSampleInputFingerprint: input.rpmSampleInputFingerprint,
    rpmSampleSource: input.rpmSampleSource,
    v1bEngineVersion: input.v1bEngineVersion,
    v1bContractVersion: input.v1bRunId ? 'ds4-rpm-hf-v1b-v1' : null,
    qualityScope: input.v1bRunId ? 'OBSERVED_HF_TEMPORAL' : null,
    bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
    gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
    eventWindowSemanticsNote: DS4_RPM_SHADOW_CORRELATION_EVENT_WINDOW_HALF_OPEN_NOTE,
    sourceTimestampPhase: 'UNKNOWN',
    omissions: input.omissions,
    unknowns: input.unknowns,
  };
}

function summarizeEvents(events: Ds4RpmShadowCorrelationEventResultV1[]): Ds4RpmShadowCorrelationTripReportV1['summary'] {
  const byContextClassification: Record<Ds4RpmShadowCorrelationContextClassification, number> = {
    AVAILABLE: 0,
    PARTIAL: 0,
    AMBIGUOUS: 0,
    UNAVAILABLE: 0,
  };
  const byCadenceTier: Record<string, number> = {};
  let defensible = 0;
  for (const e of events) {
    byContextClassification[e.contextClassification] += 1;
    const tier = e.cadenceTier ?? 'UNKNOWN';
    byCadenceTier[tier] = (byCadenceTier[tier] ?? 0) + 1;
    if (e.contextClassification === 'AVAILABLE') defensible += 1;
  }
  return {
    totalEvents: events.length,
    eventsWithDefensibleContext: defensible,
    defensibleContextShare: events.length ? defensible / events.length : null,
    byContextClassification,
    byCadenceTier,
  };
}

function aggregateTierBuckets(
  tripReports: Ds4RpmShadowCorrelationTripReportV1[],
  includeTrip: (trip: Ds4RpmShadowCorrelationTripReportV1) => boolean,
): Record<string, { trips: number; defensibleShare: number | null; eventCount: number }> {
  const byTierInternal: Record<
    string,
    { trips: number; eventCount: number; defensibleEvents: number }
  > = {};

  for (const trip of tripReports) {
    if (!includeTrip(trip)) continue;
    const tierKey = trip.events.find((e) => e.cadenceTier)?.cadenceTier ?? 'UNKNOWN';
    const prev = byTierInternal[tierKey] ?? { trips: 0, eventCount: 0, defensibleEvents: 0 };
    byTierInternal[tierKey] = {
      trips: prev.trips + 1,
      eventCount: prev.eventCount + trip.summary.totalEvents,
      defensibleEvents: prev.defensibleEvents + trip.summary.eventsWithDefensibleContext,
    };
  }

  const byTier: Ds4RpmShadowCorrelationCohortReportV1['aggregate']['byTier'] = {};
  for (const [tier, bucket] of Object.entries(byTierInternal)) {
    byTier[tier] = {
      trips: bucket.trips,
      eventCount: bucket.eventCount,
      defensibleShare: bucket.eventCount > 0 ? bucket.defensibleEvents / bucket.eventCount : null,
    };
  }
  return byTier;
}

export function buildTripLevelReferenceBandFromV1bAttach(
  bandShares: Record<string, number> | undefined,
  refProv: string | null,
): Ds4RpmShadowCorrelationTripLevelReferenceBandV1 | null {
  if (!bandShares && !refProv) return null;
  let dominant: string | null = null;
  if (bandShares) {
    const ranked = Object.entries(bandShares).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    dominant = ranked[0]?.[0] ?? null;
  }
  return {
    dominantOperatingBand: dominant,
    provenanceSummary: refProv,
    scopeNote: 'TRIP_LEVEL_AGGREGATE_NOT_EVENT_MEASURED',
  };
}

export function buildDs4RpmShadowCorrelationTripReport(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  scenarioId: string | null;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  events: Ds4RpmShadowCorrelationEventResultV1[];
  tripLevelReferenceBand: Ds4RpmShadowCorrelationTripLevelReferenceBandV1 | null;
  provenance: Ds4RpmShadowCorrelationProvenanceManifestV1;
}): Ds4RpmShadowCorrelationTripReportV1 {
  return {
    contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    evidenceKind: input.evidenceKind,
    events: input.events,
    tripLevelReferenceBand: input.tripLevelReferenceBand,
    summary: summarizeEvents(input.events),
    ds4OnlyBaseline: {
      eventCount: input.events.length,
      intensityEligibleNote: 'UNCHANGED_BY_HARNESS',
    },
    provenance: input.provenance,
  };
}

export function buildDs4RpmShadowCorrelationCohortReport(input: {
  cohortId: string;
  tripReports: Ds4RpmShadowCorrelationTripReportV1[];
  datasetGaps: string[];
  codeSha: string;
  generatedAt: Date;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
}): Ds4RpmShadowCorrelationCohortReportV1 {
  let totalEvents = 0;
  let defensible = 0;
  let fixtureEvents = 0;
  let fixtureDefensible = 0;

  const isNegativeControl = (trip: Ds4RpmShadowCorrelationTripReportV1): boolean =>
    trip.scenarioId != null &&
    (DS4_RPM_SHADOW_CORRELATION_NEGATIVE_CONTROL_SCENARIO_IDS as readonly string[]).includes(
      trip.scenarioId,
    );

  for (const trip of input.tripReports) {
    totalEvents += trip.summary.totalEvents;
    defensible += trip.summary.eventsWithDefensibleContext;
    if (!isNegativeControl(trip)) {
      fixtureEvents += trip.summary.totalEvents;
      fixtureDefensible += trip.summary.eventsWithDefensibleContext;
    }
  }

  const byTier = aggregateTierBuckets(input.tripReports, () => true);
  const byTierFixture = aggregateTierBuckets(input.tripReports, (trip) => !isNegativeControl(trip));

  const provenance = buildDs4RpmShadowCorrelationProvenanceManifest({
    codeSha: input.codeSha,
    generatedAt: input.generatedAt,
    evidenceKind: input.evidenceKind,
    motionRunId: input.tripReports[0]?.provenance.motionRunId ?? 'none',
    motionSnapshotHashAttested: null,
    v1bRunId: null,
    v1bInputFingerprint: null,
    rpmSampleInputFingerprint: null,
    rpmSampleSource: null,
    v1bEngineVersion: null,
    omissions: ['COHORT_AGGREGATE_MANIFEST'],
    unknowns: ['COHORT_LEVEL_RUN_BINDINGS_NOT_ATTESTED'],
  });

  return {
    contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
    cohortId: input.cohortId,
    tripReports: input.tripReports,
    aggregate: {
      tripCount: input.tripReports.length,
      datasetGaps: input.datasetGaps,
      evidenceKind: input.evidenceKind,
      defensibleContextShareAcrossEvents: totalEvents ? defensible / totalEvents : null,
      defensibleContextShareFixtureScenariosExcludingNegativeControls: fixtureEvents
        ? fixtureDefensible / fixtureEvents
        : null,
      negativeControlScenarioIdsExcludedFromPrevalence: [
        ...DS4_RPM_SHADOW_CORRELATION_NEGATIVE_CONTROL_SCENARIO_IDS,
      ],
      byTier,
      byTierFixtureScenariosExcludingNegativeControls: byTierFixture,
    },
    provenance,
  };
}
