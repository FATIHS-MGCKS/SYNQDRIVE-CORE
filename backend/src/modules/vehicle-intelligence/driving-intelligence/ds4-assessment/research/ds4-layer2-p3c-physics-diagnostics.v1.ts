import { createHash } from 'crypto';
import type { Ds4Layer2MotionPhysicsContextV1 } from './ds4-layer2-p3-motion-physics-context.v1.contract';
import type {
  Ds4Layer2P2AdmissibleEventRowV1,
  Ds4Layer2P2AssessmentTripRowV1,
  Ds4Layer2P3cEventDiagnosticRowV1,
  Ds4Layer2P3cLimitationReasonV1,
  Ds4Layer2P3cNumericDiagnosticAvailabilityV1,
  Ds4Layer2P3cPhysicsContextRowV1,
  Ds4Layer2P3cSidecarBuildInputV1,
  Ds4Layer2P3cSidecarArtifactsV1,
  Ds4Layer2P3cTemporalReferenceEvidenceV1,
  Ds4Layer2P3cVehicleReferenceResolutionV1,
} from './ds4-layer2-p3c-physics-diagnostics.v1.contract';
import {
  DS4_LAYER2_P3C_PHYSICS_DIAGNOSTICS_SCHEMA_VERSION_V1,
  DS4_LAYER2_P3C_PHYSICS_FORMULA_VERSION_V1,
  DS4_LAYER2_P3C_SIDEcar_ARTIFACT_FILES_V1,
} from './ds4-layer2-p3c-physics-diagnostics.v1.contract';
import {
  computeAverageAccelReferenceMps2,
  physicsReferenceAllowsDiagnostics,
  resolveMotionPhysicsForTripWindowV1,
} from './ds4-layer2-p3c-temporal-motion-physics.v1';
import {
  classifyDs4Layer2P3cTemporalProvenanceV1,
  provenanceLimitationReasons,
} from './ds4-layer2-p3c-temporal-provenance.v1';

const IMPULSE_TOLERANCE = 1e-3;

function signedMeanAccel(eventKind: string, mean: number | null): number | null {
  if (mean == null || !Number.isFinite(mean)) return null;
  if (eventKind === 'DECELERATION') return -Math.abs(mean);
  if (eventKind === 'ACCELERATION') return Math.abs(mean);
  return null;
}

function jsonReasons(reasons: readonly Ds4Layer2P3cLimitationReasonV1[]): string {
  return JSON.stringify(reasons);
}

function referenceLimitations(context: Ds4Layer2MotionPhysicsContextV1): Ds4Layer2P3cLimitationReasonV1[] {
  const out: Ds4Layer2P3cLimitationReasonV1[] = [];
  for (const r of context.limitationReasons) {
    if (r === 'ENGINE_RATED_POWER_NOT_SYSTEM_POWER') {
      out.push('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
    }
  }
  if (context.applicability === 'ESTIMATED_ONLY') {
    out.push('EXPLORATORY_ESTIMATED_REFERENCE');
  }
  if (
    context.applicability === 'MISSING' ||
    context.applicability === 'AMBIGUOUS' ||
    context.applicability === 'IDENTITY_MISMATCH' ||
    context.applicability === 'NOT_ELIGIBLE'
  ) {
    out.push('REFERENCE_APPLICABILITY_BLOCKED');
  }
  return out;
}

export function recomputeSpecificImpulseMpsForKindV1(
  events: readonly Ds4Layer2P2AdmissibleEventRowV1[],
  kind: 'ACCELERATION' | 'DECELERATION',
): number {
  let sum = 0;
  for (const e of events) {
    if (e.eventKind !== kind) continue;
    const a = e.meanAccelMps2;
    const t = e.durationS;
    if (a == null || t == null || !Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t < 0) {
      continue;
    }
    sum += a * t;
  }
  return sum;
}

export async function buildDs4Layer2P3cPhysicsDiagnosticsV1(input: {
  organizationId: string;
  admissibleEvents: readonly Ds4Layer2P2AdmissibleEventRowV1[];
  assessmentTrips: readonly Ds4Layer2P2AssessmentTripRowV1[];
  resolveVehicleReference(input: {
    vehicleId: string;
    tripStartUtc: Date;
    tripEndUtc: Date;
  }): Promise<Ds4Layer2P3cVehicleReferenceResolutionV1 | null>;
}): Promise<{
  physicsContextRows: Ds4Layer2P3cPhysicsContextRowV1[];
  eventDiagnosticRows: Ds4Layer2P3cEventDiagnosticRowV1[];
  limitationRows: Record<string, unknown>[];
  summary: Record<string, unknown>;
}> {
  const eventsByTrip = new Map<string, Ds4Layer2P2AdmissibleEventRowV1[]>();
  for (const e of input.admissibleEvents) {
    const list = eventsByTrip.get(e.tripId) ?? [];
    list.push(e);
    eventsByTrip.set(e.tripId, list);
  }

  const physicsContextRows: Ds4Layer2P3cPhysicsContextRowV1[] = [];
  const eventDiagnosticRows: Ds4Layer2P3cEventDiagnosticRowV1[] = [];
  const limitationRows: Record<string, unknown>[] = [];

  const availabilityCounts: Record<string, number> = {};
  const unavailableByReason: Record<string, number> = {};
  const temporalProvenanceCounts: Record<string, number> = {};
  let historicalEvidenceSupportedCount = 0;
  let retrospectiveCount = 0;

  for (const trip of input.assessmentTrips) {
    const tripEvents = eventsByTrip.get(trip.tripId) ?? [];
    const starts = tripEvents.map((e) => Date.parse(e.startLabelUtc)).filter(Number.isFinite);
    const ends = tripEvents.map((e) => Date.parse(e.endLabelUtc)).filter(Number.isFinite);
    const tripStartUtc = new Date(Math.min(...starts));
    const tripEndUtc = new Date(Math.max(...ends));

    const resolution = await input.resolveVehicleReference({
      vehicleId: trip.vehicleId,
      tripStartUtc,
      tripEndUtc,
    });

    if (resolution == null || resolution.reference == null) {
      const temporalProvenance = 'REFERENCE_UNAVAILABLE' as const;
      temporalProvenanceCounts[temporalProvenance] = (temporalProvenanceCounts[temporalProvenance] ?? 0) + 1;
      physicsContextRows.push({
        organizationId: input.organizationId,
        vehicleId: trip.vehicleId,
        tripId: trip.tripId,
        tripStartUtc: tripStartUtc.toISOString(),
        tripEndUtc: tripEndUtc.toISOString(),
        motionReferenceId: null,
        referenceResolutionSource: resolution?.resolutionSource ?? 'PERSISTED_POINT_IN_TIME',
        referenceApplicability: 'MISSING',
        referenceEvidenceTier: null,
        referenceEffectiveFrom: null,
        referenceEffectiveTo: null,
        referenceCreatedAtUtc: resolution?.referenceCreatedAtUtc ?? null,
        temporalReferenceEvidence: 'TEMPORAL_AMBIGUOUS',
        temporalProvenance,
        historicalEvidenceSupported: false,
        currentReferenceApplicability: 'MISSING',
        avgAccelReferenceMps2: null,
        curbMassKg: null,
        limitationReasonsJson: jsonReasons([
          'REFERENCE_APPLICABILITY_BLOCKED',
          'HISTORICAL_APPLICABILITY_NOT_EVIDENCED',
        ]),
      });
      for (const ev of tripEvents) {
        eventDiagnosticRows.push(
          unavailableEventRow(ev, {
            applicability: 'MISSING',
            temporal: 'TEMPORAL_AMBIGUOUS',
            temporalProvenance,
            historicalEvidenceSupported: false,
            referenceEvidenceTier: null,
            reasons: ['REFERENCE_APPLICABILITY_BLOCKED', 'HISTORICAL_APPLICABILITY_NOT_EVIDENCED'],
          }),
        );
      }
      continue;
    }

    const { atTripEnd, atNow, temporalEvidence } = await resolveMotionPhysicsForTripWindowV1({
      organizationId: input.organizationId,
      vehicleId: trip.vehicleId,
      tripStartUtc,
      tripEndUtc,
      vehicle: resolution.vehicle,
      reference: resolution.reference,
    });

    const { temporalProvenance, historicalEvidenceSupported } = classifyDs4Layer2P3cTemporalProvenanceV1({
      resolutionSource: resolution.resolutionSource,
      referenceCreatedAtUtc: resolution.referenceCreatedAtUtc
        ? new Date(resolution.referenceCreatedAtUtc)
        : null,
      tripStartUtc,
      tripEndUtc,
      temporalReferenceEvidence: temporalEvidence,
      atTripEnd,
    });

    temporalProvenanceCounts[temporalProvenance] = (temporalProvenanceCounts[temporalProvenance] ?? 0) + 1;
    if (historicalEvidenceSupported) historicalEvidenceSupportedCount += 1;
    if (temporalProvenance === 'RETROSPECTIVE_REFERENCE') retrospectiveCount += 1;

    const ctxReasons: Ds4Layer2P3cLimitationReasonV1[] = [
      ...referenceLimitations(atTripEnd),
      ...provenanceLimitationReasons({
        temporalProvenance,
        historicalEvidenceSupported,
        referenceApplicability: atTripEnd.applicability,
      }),
    ];
    if (temporalEvidence !== 'EFFECTIVE_AT_TRIP_END') {
      ctxReasons.push('TEMPORAL_REFERENCE_NOT_APPLICABLE_AT_TRIP');
    }

    const diagnosticsAllowed = physicsReferenceAllowsDiagnostics(atTripEnd.applicability, temporalEvidence);
    const avgRef = diagnosticsAllowed
      ? computeAverageAccelReferenceMps2(atTripEnd.accel0To100S)
      : null;
    const curbMass =
      diagnosticsAllowed &&
      atTripEnd.curbMassKg != null &&
      Number.isFinite(atTripEnd.curbMassKg) &&
      atTripEnd.curbMassKg > 0
        ? atTripEnd.curbMassKg
        : null;

    if (diagnosticsAllowed && avgRef == null) {
      ctxReasons.push('MISSING_POSITIVE_ACCEL0_TO100');
    }
    if (diagnosticsAllowed && curbMass == null) {
      ctxReasons.push('MISSING_POSITIVE_CURB_MASS');
    }

    const accelImpulse = recomputeSpecificImpulseMpsForKindV1(tripEvents, 'ACCELERATION');
    const brakeImpulse = recomputeSpecificImpulseMpsForKindV1(tripEvents, 'DECELERATION');
    if (
      trip.accelSpecificImpulseMps != null &&
      Math.abs(accelImpulse - trip.accelSpecificImpulseMps) > IMPULSE_TOLERANCE
    ) {
      ctxReasons.push('P2_IMPULSE_CONSISTENCY_MISMATCH');
      limitationRows.push({
        scope: 'TRIP',
        tripId: trip.tripId,
        kind: 'ACCELERATION',
        p2Value: trip.accelSpecificImpulseMps,
        recomputedValue: accelImpulse,
        reason: 'P2_IMPULSE_CONSISTENCY_MISMATCH',
      });
    }
    if (
      trip.brakeSpecificImpulseMps != null &&
      Math.abs(brakeImpulse - trip.brakeSpecificImpulseMps) > IMPULSE_TOLERANCE
    ) {
      ctxReasons.push('P2_IMPULSE_CONSISTENCY_MISMATCH');
      limitationRows.push({
        scope: 'TRIP',
        tripId: trip.tripId,
        kind: 'DECELERATION',
        p2Value: trip.brakeSpecificImpulseMps,
        recomputedValue: brakeImpulse,
        reason: 'P2_IMPULSE_CONSISTENCY_MISMATCH',
      });
    }

    physicsContextRows.push({
      organizationId: input.organizationId,
      vehicleId: trip.vehicleId,
      tripId: trip.tripId,
      tripStartUtc: tripStartUtc.toISOString(),
      tripEndUtc: tripEndUtc.toISOString(),
      motionReferenceId: atTripEnd.motionReferenceId,
      referenceResolutionSource: resolution.resolutionSource,
      referenceApplicability: atTripEnd.applicability,
      referenceEvidenceTier: atTripEnd.evidenceTier,
      referenceEffectiveFrom: atTripEnd.effectiveFrom,
      referenceEffectiveTo: atTripEnd.effectiveTo,
      referenceCreatedAtUtc: resolution.referenceCreatedAtUtc,
      temporalReferenceEvidence: temporalEvidence,
      temporalProvenance,
      historicalEvidenceSupported,
      currentReferenceApplicability: atNow.applicability,
      avgAccelReferenceMps2: avgRef,
      curbMassKg: curbMass,
      limitationReasonsJson: jsonReasons(ctxReasons),
    });

    for (const ev of tripEvents) {
      const row = buildEventDiagnosticRow({
        ev,
        atTripEnd,
        temporalEvidence,
        temporalProvenance,
        historicalEvidenceSupported,
        avgRef,
        curbMass,
        diagnosticsAllowed,
      });
      eventDiagnosticRows.push(row);
      availabilityCounts[row.numericDiagnosticAvailability] =
        (availabilityCounts[row.numericDiagnosticAvailability] ?? 0) + 1;
      if (row.numericDiagnosticAvailability === 'UNAVAILABLE') {
        const parsed = JSON.parse(row.limitationReasonsJson) as string[];
        for (const reason of parsed) {
          unavailableByReason[reason] = (unavailableByReason[reason] ?? 0) + 1;
        }
      }
    }
  }

  physicsContextRows.sort((a, b) => a.tripId.localeCompare(b.tripId));
  eventDiagnosticRows.sort((a, b) => {
    const t = a.tripId.localeCompare(b.tripId);
    return t !== 0 ? t : a.eventIndex - b.eventIndex;
  });

  return {
    physicsContextRows,
    eventDiagnosticRows,
    limitationRows,
    summary: {
      admissibleP2EventCount: input.admissibleEvents.length,
      numericDiagnosticAvailabilityCounts: availabilityCounts,
      temporalProvenanceCounts,
      historicalEvidenceSupportedTripCount: historicalEvidenceSupportedCount,
      retrospectiveReferenceTripCount: retrospectiveCount,
      unavailableByReason,
      tripCount: input.assessmentTrips.length,
    },
  };
}

function unavailableEventRow(
  ev: Ds4Layer2P2AdmissibleEventRowV1,
  input: {
    applicability: Ds4Layer2MotionPhysicsContextV1['applicability'];
    temporal: Ds4Layer2P3cTemporalReferenceEvidenceV1;
    temporalProvenance: import('./ds4-layer2-p3c-physics-diagnostics.v1.contract').Ds4Layer2P3cTemporalProvenanceV1;
    historicalEvidenceSupported: boolean;
    referenceEvidenceTier: string | null;
    reasons: Ds4Layer2P3cLimitationReasonV1[];
  },
): Ds4Layer2P3cEventDiagnosticRowV1 {
  return {
    tripId: ev.tripId,
    vehicleId: ev.vehicleId,
    offlineReconstructionKey: ev.offlineReconstructionKey,
    sourceMotionRunId: ev.sourceMotionRunId,
    eventIndex: ev.eventIndex,
    eventKind: ev.eventKind,
    eligibilityClassification: ev.eligibilityClassification,
    meanAccelMps2: ev.meanAccelMps2,
    signedMeanAccelMps2: null,
    avgAccelReferenceMps2: null,
    accelRatioToReference: null,
    estimatedNetLongitudinalForceN: null,
    numericDiagnosticAvailability: 'UNAVAILABLE',
    referenceEvidenceTier: input.referenceEvidenceTier,
    referenceApplicability: input.applicability,
    temporalReferenceEvidence: input.temporal,
    temporalProvenance: input.temporalProvenance,
    historicalEvidenceSupported: input.historicalEvidenceSupported,
    limitationReasonsJson: jsonReasons(input.reasons),
  };
}

function buildEventDiagnosticRow(input: {
  ev: Ds4Layer2P2AdmissibleEventRowV1;
  atTripEnd: Ds4Layer2MotionPhysicsContextV1;
  temporalEvidence: Ds4Layer2P3cTemporalReferenceEvidenceV1;
  temporalProvenance: import('./ds4-layer2-p3c-physics-diagnostics.v1.contract').Ds4Layer2P3cTemporalProvenanceV1;
  historicalEvidenceSupported: boolean;
  avgRef: number | null;
  curbMass: number | null;
  diagnosticsAllowed: boolean;
}): Ds4Layer2P3cEventDiagnosticRowV1 {
  const reasons: Ds4Layer2P3cLimitationReasonV1[] = [
    ...referenceLimitations(input.atTripEnd),
    ...provenanceLimitationReasons({
      temporalProvenance: input.temporalProvenance,
      historicalEvidenceSupported: input.historicalEvidenceSupported,
      referenceApplicability: input.atTripEnd.applicability,
    }),
  ];

  if (!input.diagnosticsAllowed) {
    if (input.temporalEvidence !== 'EFFECTIVE_AT_TRIP_END') {
      reasons.push('TEMPORAL_REFERENCE_NOT_APPLICABLE_AT_TRIP');
    }
    return unavailableEventRow(input.ev, {
      applicability: input.atTripEnd.applicability,
      temporal: input.temporalEvidence,
      temporalProvenance: input.temporalProvenance,
      historicalEvidenceSupported: input.historicalEvidenceSupported,
      referenceEvidenceTier: input.atTripEnd.evidenceTier,
      reasons: reasons.length ? reasons : ['REFERENCE_APPLICABILITY_BLOCKED'],
    });
  }

  const signed = signedMeanAccel(input.ev.eventKind, input.ev.meanAccelMps2);
  if (signed == null) {
    reasons.push('NON_FINITE_EVENT_ACCEL');
    return unavailableEventRow(input.ev, {
      applicability: input.atTripEnd.applicability,
      temporal: input.temporalEvidence,
      temporalProvenance: input.temporalProvenance,
      historicalEvidenceSupported: input.historicalEvidenceSupported,
      referenceEvidenceTier: input.atTripEnd.evidenceTier,
      reasons,
    });
  }

  let accelRatio: number | null = null;
  if (input.ev.eventKind === 'ACCELERATION') {
    if (input.avgRef != null && input.avgRef > 0) {
      accelRatio = Math.abs(signed) / input.avgRef;
    } else {
      reasons.push('MISSING_POSITIVE_ACCEL0_TO100');
    }
  } else {
    reasons.push('BRAKING_EVENT_NO_ACCEL_REFERENCE_RATIO');
  }

  let forceN: number | null = null;
  if (input.curbMass != null && input.curbMass > 0) {
    forceN = input.curbMass * signed;
  } else {
    reasons.push('MISSING_POSITIVE_CURB_MASS');
  }

  const hasPrimaryDiagnostic = forceN != null || (accelRatio != null && input.ev.eventKind === 'ACCELERATION');
  const availability: Ds4Layer2P3cNumericDiagnosticAvailabilityV1 = hasPrimaryDiagnostic
    ? 'AVAILABLE'
    : 'UNAVAILABLE';

  return {
    tripId: input.ev.tripId,
    vehicleId: input.ev.vehicleId,
    offlineReconstructionKey: input.ev.offlineReconstructionKey,
    sourceMotionRunId: input.ev.sourceMotionRunId,
    eventIndex: input.ev.eventIndex,
    eventKind: input.ev.eventKind,
    eligibilityClassification: input.ev.eligibilityClassification,
    meanAccelMps2: input.ev.meanAccelMps2,
    signedMeanAccelMps2: signed,
    avgAccelReferenceMps2: input.avgRef,
    accelRatioToReference: accelRatio,
    estimatedNetLongitudinalForceN: forceN,
    numericDiagnosticAvailability: availability,
    referenceEvidenceTier: input.atTripEnd.evidenceTier,
    referenceApplicability: input.atTripEnd.applicability,
    temporalReferenceEvidence: input.temporalEvidence,
    temporalProvenance: input.temporalProvenance,
    historicalEvidenceSupported: input.historicalEvidenceSupported,
    limitationReasonsJson: jsonReasons(reasons),
  };
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return csvEscape(String(value));
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildDs4Layer2P3cSidecarArtifactsV1(
  input: Ds4Layer2P3cSidecarBuildInputV1,
): Ds4Layer2P3cSidecarArtifactsV1 {
  const physicsColumns = [
    'organization_id',
    'vehicle_id',
    'trip_id',
    'trip_start_utc',
    'trip_end_utc',
    'motion_reference_id',
    'reference_resolution_source',
    'reference_applicability',
    'reference_evidence_tier',
    'reference_effective_from',
    'reference_effective_to',
    'reference_created_at_utc',
    'temporal_reference_evidence',
    'temporal_provenance',
    'historical_evidence_supported',
    'current_reference_applicability',
    'avg_accel_reference_mps2',
    'curb_mass_kg',
    'limitation_reasons_json',
  ] as const;

  const eventColumns = [
    'trip_id',
    'vehicle_id',
    'offline_reconstruction_key',
    'source_motion_run_id',
    'event_index',
    'event_kind',
    'eligibility_classification',
    'mean_accel_mps2',
    'signed_mean_accel_mps2',
    'avg_accel_reference_mps2',
    'accel_ratio_to_reference',
    'estimated_net_longitudinal_force_n',
    'numeric_diagnostic_availability',
    'reference_evidence_tier',
    'reference_applicability',
    'temporal_reference_evidence',
    'temporal_provenance',
    'historical_evidence_supported',
    'limitation_reasons_json',
  ] as const;

  const physicsLines = [physicsColumns.join(',')];
  for (const row of input.physicsContextRows) {
    physicsLines.push(
      physicsColumns
        .map((c) => {
          const map: Record<string, unknown> = {
            organization_id: row.organizationId,
            vehicle_id: row.vehicleId,
            trip_id: row.tripId,
            trip_start_utc: row.tripStartUtc,
            trip_end_utc: row.tripEndUtc,
            motion_reference_id: row.motionReferenceId,
            reference_resolution_source: row.referenceResolutionSource,
            reference_applicability: row.referenceApplicability,
            reference_evidence_tier: row.referenceEvidenceTier,
            reference_effective_from: row.referenceEffectiveFrom,
            reference_effective_to: row.referenceEffectiveTo,
            reference_created_at_utc: row.referenceCreatedAtUtc,
            temporal_reference_evidence: row.temporalReferenceEvidence,
            temporal_provenance: row.temporalProvenance,
            historical_evidence_supported: row.historicalEvidenceSupported,
            current_reference_applicability: row.currentReferenceApplicability,
            avg_accel_reference_mps2: row.avgAccelReferenceMps2,
            curb_mass_kg: row.curbMassKg,
            limitation_reasons_json: row.limitationReasonsJson,
          };
          return csvCell(map[c]);
        })
        .join(','),
    );
  }
  const physicsContextCsv = `${physicsLines.join('\n')}\n`;

  const eventLines = [eventColumns.join(',')];
  for (const row of input.eventDiagnosticRows) {
    eventLines.push(
      eventColumns
        .map((c) => {
          const map: Record<string, unknown> = {
            trip_id: row.tripId,
            vehicle_id: row.vehicleId,
            offline_reconstruction_key: row.offlineReconstructionKey,
            source_motion_run_id: row.sourceMotionRunId,
            event_index: row.eventIndex,
            event_kind: row.eventKind,
            eligibility_classification: row.eligibilityClassification,
            mean_accel_mps2: row.meanAccelMps2,
            signed_mean_accel_mps2: row.signedMeanAccelMps2,
            avg_accel_reference_mps2: row.avgAccelReferenceMps2,
            accel_ratio_to_reference: row.accelRatioToReference,
            estimated_net_longitudinal_force_n: row.estimatedNetLongitudinalForceN,
            numeric_diagnostic_availability: row.numericDiagnosticAvailability,
            reference_evidence_tier: row.referenceEvidenceTier,
            reference_applicability: row.referenceApplicability,
            temporal_reference_evidence: row.temporalReferenceEvidence,
            temporal_provenance: row.temporalProvenance,
            historical_evidence_supported: row.historicalEvidenceSupported,
            limitation_reasons_json: row.limitationReasonsJson,
          };
          return csvCell(map[c]);
        })
        .join(','),
    );
  }
  const eventDiagnosticsCsv = `${eventLines.join('\n')}\n`;

  const limitationColumns = ['scope', 'trip_id', 'event_index', 'reason', 'detail_json'];
  const limitationLines = [limitationColumns.join(',')];
  for (const row of input.limitationRows) {
    limitationLines.push(
      limitationColumns
        .map((col) =>
          csvCell(
            col === 'detail_json'
              ? JSON.stringify(row)
              : (row[col] ?? ''),
          ),
        )
        .join(','),
    );
  }
  const limitationsCsv = `${limitationLines.join('\n')}\n`;

  const fileChecksums: Record<string, string> = {
    'p3c_physics_context.csv': sha256Hex(physicsContextCsv),
    'p3c_event_diagnostics.csv': sha256Hex(eventDiagnosticsCsv),
    'p3c_limitations.csv': sha256Hex(limitationsCsv),
  };

  const manifestWithoutSelf: Record<string, unknown> = {
    schemaVersion: DS4_LAYER2_P3C_PHYSICS_DIAGNOSTICS_SCHEMA_VERSION_V1,
    formulaVersion: DS4_LAYER2_P3C_PHYSICS_FORMULA_VERSION_V1,
    builtAtUtc: input.builtAtUtc.toISOString(),
    organizationId: input.organizationId,
    p3cEvaluationCodeSha: input.p3cEvaluationCodeSha,
    p2EvaluationCodeSha: input.p2EvaluationCodeSha,
    p2InputChecksumsSha256: input.p2InputChecksumsSha256,
    p2ManifestChecksumSha256: input.p2ManifestChecksumSha256,
    kinematicInvariant: 'P2_CSV_UNMODIFIED_SIDEcar_ONLY',
    summary: input.summary,
    artifactFiles: [...DS4_LAYER2_P3C_SIDEcar_ARTIFACT_FILES_V1],
    fileChecksumsSha256: fileChecksums,
  };

  const manifest = {
    ...manifestWithoutSelf,
    manifestChecksumSha256: sha256Hex(`${JSON.stringify(manifestWithoutSelf, null, 2)}\n`),
  };

  return {
    manifest,
    physicsContextCsv,
    eventDiagnosticsCsv,
    limitationsCsv,
    fileChecksums,
  };
}
