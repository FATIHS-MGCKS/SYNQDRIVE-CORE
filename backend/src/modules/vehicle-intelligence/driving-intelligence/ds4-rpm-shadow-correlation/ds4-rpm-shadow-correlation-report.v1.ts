import type {
  Ds4RpmShadowCorrelationContextClassification,
  Ds4RpmShadowCorrelationCohortReportV1,
  Ds4RpmShadowCorrelationEventResultV1,
  Ds4RpmShadowCorrelationProvenanceManifestV1,
  Ds4RpmShadowCorrelationTripReportV1,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION } from './ds4-rpm-shadow-correlation-v1.contract';

export function buildDs4RpmShadowCorrelationProvenanceManifest(input: {
  codeSha: string;
  generatedAt: Date;
  motionRunId: string;
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
    motionRunId: input.motionRunId,
    v1bRunId: input.v1bRunId,
    v1bInputFingerprint: input.v1bInputFingerprint,
    rpmSampleInputFingerprint: input.rpmSampleInputFingerprint,
    rpmSampleSource: input.rpmSampleSource,
    v1bEngineVersion: input.v1bEngineVersion,
    v1bContractVersion: input.v1bRunId ? 'ds4-rpm-hf-v1b-v1' : null,
    qualityScope: input.v1bRunId ? 'OBSERVED_HF_TEMPORAL' : null,
    bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
    gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
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

export function buildDs4RpmShadowCorrelationTripReport(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  scenarioId: string | null;
  events: Ds4RpmShadowCorrelationEventResultV1[];
  provenance: Ds4RpmShadowCorrelationProvenanceManifestV1;
}): Ds4RpmShadowCorrelationTripReportV1 {
  return {
    contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    events: input.events,
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
}): Ds4RpmShadowCorrelationCohortReportV1 {
  let totalEvents = 0;
  let defensible = 0;
  const byTierInternal: Record<
    string,
    { trips: number; eventCount: number; defensibleEvents: number }
  > = {};

  for (const trip of input.tripReports) {
    totalEvents += trip.summary.totalEvents;
    defensible += trip.summary.eventsWithDefensibleContext;
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

  const provenance = buildDs4RpmShadowCorrelationProvenanceManifest({
    codeSha: input.codeSha,
    generatedAt: input.generatedAt,
    motionRunId: input.tripReports[0]?.provenance.motionRunId ?? 'none',
    v1bRunId: null,
    v1bInputFingerprint: null,
    rpmSampleInputFingerprint: null,
    rpmSampleSource: null,
    v1bEngineVersion: null,
    omissions: ['COHORT_AGGREGATE_MANIFEST'],
    unknowns: [],
  });

  return {
    contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
    cohortId: input.cohortId,
    tripReports: input.tripReports,
    aggregate: {
      tripCount: input.tripReports.length,
      datasetGaps: input.datasetGaps,
      defensibleContextShareAcrossEvents: totalEvents ? defensible / totalEvents : null,
      byTier,
    },
    provenance,
  };
}
