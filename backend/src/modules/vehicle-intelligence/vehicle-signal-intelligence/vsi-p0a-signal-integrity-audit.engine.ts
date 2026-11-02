import {
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  type VsiCanonicalSignalKey,
} from './canonical-signal-keys';
import { mapProfileRowToDetail } from './vsi-master-intelligence-read.mapper';
import type { MasterVsiSignalDetailDto } from './vsi-master-intelligence-read.types';
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import {
  classifyVsiP0aSignalFinding,
  isVsiP0aDeclaredCatalogKey,
  resolveVsiP0aApplicability,
  summarizeVsiP0aMatrix,
} from './vsi-p0a-signal-integrity-audit.classifier';
import type {
  VsiP0aAuditCohort,
  VsiP0aAuditCohortVehicle,
  VsiP0aHfEvidenceSlice,
  VsiP0aProductionVerification,
  VsiP0aSignalIntegrityMatrixDocument,
  VsiP0aSignalIntegrityMatrixRow,
  VSI_P0A_SIGNAL_INTEGRITY_MATRIX_SCHEMA,
} from './vsi-p0a-signal-integrity-audit.types';

export const VSI_P0A_HF_HISTORY_DAYS = 14;
export const VSI_P0A_MAX_FINALIZED_TRIPS = 20;
export const VSI_P0A_MAX_RPM_POINTS = 12_000;

export type VsiP0aProfileAuditBundle = {
  vehicle: VsiP0aAuditCohortVehicle;
  sourceLinkId: string;
  provider: string | null;
  providerModality: string | null;
  profileRow: {
    evaluatedAt: Date;
    lastMaterializedProviderFetchAt: Date | null;
    signalsSnapshot: unknown;
    providerSourceLinkId: string;
    providerIdentity: string;
    profileRevision: number;
    profileContractVersion: string;
    profileLimitations: unknown;
    contentFingerprint: string;
    lastMaterializedSourceTimestamp: Date | null;
  };
  hfBySignal: Partial<Record<VsiCanonicalSignalKey, VsiP0aHfEvidenceSlice>>;
  verificationPartial: boolean;
};

function allCanonicalKeys(): VsiCanonicalSignalKey[] {
  return Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS) as VsiCanonicalSignalKey[];
}

function describeApiPresentation(dto: MasterVsiSignalDetailDto | null): string {
  if (!dto) return 'NOT_IN_API_DTO';
  return [
    `empirical=${dto.empiricalObservation}`,
    `quality=${dto.qualityClassification ?? 'null'}`,
    `confidence=${dto.confidenceLevel ?? 'null'}`,
    `freshness=${dto.freshnessClassification ?? 'null'}`,
    `declared=${dto.declaredSupport}`,
  ].join(';');
}

function describeUiPresentation(
  dto: MasterVsiSignalDetailDto | null,
  canonicalSignal: VsiCanonicalSignalKey,
): string {
  if (!dto) return 'NOT_RENDERED';
  const rawEnumFields = [
    dto.empiricalObservation,
    dto.qualityClassification,
    dto.confidenceLevel,
    dto.freshnessClassification,
    dto.declaredSupport,
    ...(dto.limitations ?? []),
  ].filter(Boolean);
  const usesRawEnums = rawEnumFields.some((v) => typeof v === 'string' && /^[A-Z0-9_]+$/.test(v));
  const dualPanel =
    canonicalSignal === 'engine_rpm'
      ? 'dual_provenance_panel_when_deployed'
      : 'no_lane_split_ui';
  return `${dualPanel};raw_enum_in_table=${usesRawEnums ? 'yes' : 'no'}`;
}

function findSignalInSnapshot(
  signals: VsiProfileSignalFingerprintV1[],
  key: string,
): VsiProfileSignalFingerprintV1 | null {
  return signals.find((s) => s.canonicalSignalKey === key) ?? null;
}

function hfFromCadence(signal: VsiProfileSignalFingerprintV1 | null): VsiP0aHfEvidenceSlice {
  if (!signal?.cadenceIntelligence) {
    return {
      availability: 'NOT_SUPPORTED_BY_PIPELINE',
      sampleCount: null,
      tripCount: null,
      windowStart: null,
      windowEnd: null,
      activeCadenceProfile: null,
      queryLimits: {},
    };
  }
  const c = signal.cadenceIntelligence;
  const count =
    c.observedSampleCount ?? c.distinctTimestampCount ?? null;
  const trips = c.finalizedTripCount ?? c.activeRpmProfile?.evaluatedTripIds?.length ?? null;
  const active = c.activeRpmProfile?.activeProfile ?? c.lvStandbyTransmissionProfile?.profile ?? null;
  const hasSamples = typeof count === 'number' && count > 0;
  return {
    availability: hasSamples ? 'SUPPORTED_WITH_SAMPLES' : 'SUPPORTED_EMPTY',
    sampleCount: count,
    tripCount: trips,
    windowStart: c.rpmCadenceTierResolution?.evidenceObservedAt ?? null,
    windowEnd: null,
    activeCadenceProfile: active,
    queryLimits: {
      source: 'profile_cadence_intelligence_snapshot',
    },
  };
}

export function buildVsiP0aMatrixRows(bundle: VsiP0aProfileAuditBundle): VsiP0aSignalIntegrityMatrixRow[] {
  const detail = mapProfileRowToDetail(
    {
      ...bundle.profileRow,
      organizationId: '',
      vehicleId: bundle.vehicle.vehicleId,
      providerIdentity: bundle.profileRow.providerIdentity,
      verifiedModality: bundle.providerModality,
      telemetrySourceFamily: null,
      declaredCatalogCheckedAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      materializationTrigger: 'AUDIT',
      createdAt: bundle.profileRow.evaluatedAt,
      updatedAt: bundle.profileRow.evaluatedAt,
    } as never,
    bundle.provider,
  );

  const snapshotSignals = detail.signals as unknown as VsiProfileSignalFingerprintV1[];
  const dtoByKey = new Map(detail.signals.map((s) => [s.canonicalSignalKey, s]));

  return allCanonicalKeys().map((canonicalSignal) => {
    const def = VSI_CANONICAL_SIGNAL_DEFINITIONS[canonicalSignal];
    const snap = findSignalInSnapshot(snapshotSignals, canonicalSignal);
    const dto = dtoByKey.get(canonicalSignal) ?? null;
    const applicability = resolveVsiP0aApplicability(canonicalSignal, bundle.vehicle);

    let hf: VsiP0aHfEvidenceSlice =
      bundle.hfBySignal[canonicalSignal] ??
      (canonicalSignal === 'engine_rpm' || canonicalSignal === 'lv_voltage'
        ? hfFromCadence(snap)
        : {
            availability: 'NOT_SUPPORTED_BY_PIPELINE',
            sampleCount: null,
            tripCount: null,
            windowStart: null,
            windowEnd: null,
            activeCadenceProfile: null,
            queryLimits: { reason: 'no_hf_pipeline_for_key' },
          });

    if (bundle.verificationPartial) {
      hf = { ...hf, availability: hf.availability === 'NOT_SUPPORTED_BY_PIPELINE' ? hf.availability : 'NOT_VERIFIED' };
    }

    const declaredSupport = snap?.declaredSupport ?? (isVsiP0aDeclaredCatalogKey(canonicalSignal) ? 'UNKNOWN' : null);

    const classification = classifyVsiP0aSignalFinding({
      vehicle: bundle.vehicle,
      canonicalSignal,
      applicability,
      declaredSupport,
      snapshotObservation: snap?.empiricalObservation ?? null,
      snapshotQuality: snap?.qualityClassification ?? null,
      snapshotConfidence: snap?.confidenceLevel ?? null,
      hfAvailability: hf.availability,
      hfSampleCount: hf.sampleCount,
      activeCadenceProfile: hf.activeCadenceProfile,
      freshness: snap?.freshnessClassification ?? null,
      provenance: [
        ...(snap?.evidenceProvenance ?? []),
        ...(snap?.cadenceIntelligence?.provenance ?? []),
      ],
      limitations: snap?.limitations ?? [],
      materializedInProfile: snap != null,
    });

    const verificationStatus =
      bundle.verificationPartial && hf.availability === 'NOT_VERIFIED'
        ? 'NOT_VERIFIED'
        : snap
          ? 'VERIFIED'
          : 'PARTIAL';

    return {
      vehicleId: bundle.vehicle.vehicleId,
      vehicleLabel: bundle.vehicle.vehicleLabel,
      provider: bundle.provider,
      sourceLinkId: bundle.sourceLinkId,
      canonicalSignal,
      unit: def.canonicalUnit,
      applicability,
      declaredSupport,
      snapshotObservation: snap?.empiricalObservation ?? null,
      snapshotQuality: snap?.qualityClassification ?? null,
      snapshotConfidence: snap?.confidenceLevel ?? null,
      hfAvailability: hf.availability,
      hfSampleCount: hf.sampleCount,
      hfTripCount: hf.tripCount,
      hfWindowStart: hf.windowStart,
      hfWindowEnd: hf.windowEnd,
      activeCadenceProfile: hf.activeCadenceProfile,
      signalTimestamp: snap?.lastSourceTimestamp ?? snap?.lastValidObservationAt ?? null,
      fetchTimestamp:
        snap?.lastProviderFetchAt ??
        bundle.profileRow.lastMaterializedProviderFetchAt?.toISOString() ??
        null,
      evaluatedAt: bundle.profileRow.evaluatedAt.toISOString(),
      freshness: snap?.freshnessClassification ?? null,
      provenance: [
        ...(snap?.evidenceProvenance ?? []),
        ...(snap?.cadenceIntelligence?.provenance ?? []),
      ],
      apiPresentation: describeApiPresentation(dto),
      uiPresentation: describeUiPresentation(dto, canonicalSignal),
      findingClass: classification.findingClass,
      severity: classification.severity,
      evidenceReference: classification.evidenceReference,
      verificationStatus,
    };
  });
}

export function assembleVsiP0aMatrixDocument(input: {
  auditExecutedAt: Date;
  auditTimezone: string;
  productionVerification: VsiP0aProductionVerification;
  cohort: VsiP0aAuditCohort;
  bundles: VsiP0aProfileAuditBundle[];
}): VsiP0aSignalIntegrityMatrixDocument {
  const rows = input.bundles.flatMap((b) => buildVsiP0aMatrixRows(b));
  const tallies = summarizeVsiP0aMatrix(rows);
  const canonicalSignalCount = allCanonicalKeys().length;

  return {
    schema: 'synqdrive.vsi.signal_integrity_matrix.v1' as typeof VSI_P0A_SIGNAL_INTEGRITY_MATRIX_SCHEMA,
    auditExecutedAt: input.auditExecutedAt.toISOString(),
    auditTimezone: input.auditTimezone,
    queryWindow: {
      hfHistoryDays: VSI_P0A_HF_HISTORY_DAYS,
      maxFinalizedTrips: VSI_P0A_MAX_FINALIZED_TRIPS,
      maxRpmPoints: VSI_P0A_MAX_RPM_POINTS,
    },
    productionVerification: input.productionVerification,
    cohort: input.cohort,
    summary: {
      canonicalSignalCount,
      vehicleCount: input.cohort.vehicles.length,
      matrixRows: rows.length,
      verifiedRows: tallies.verifiedRows,
      notVerifiedRows: tallies.notVerifiedRows,
      confirmedBugs: tallies.confirmedBugs,
      misleadingPresentations: tallies.misleadingPresentations,
      semanticAmbiguities: tallies.semanticAmbiguities,
      insufficientEvidence: tallies.insufficientEvidence,
      expectedBehavior: tallies.expectedBehavior,
      p0Findings: tallies.p0Findings,
      p1Findings: tallies.p1Findings,
      openHypotheses: rows.filter((r) => r.findingClass === 'INSUFFICIENT_EVIDENCE').length,
    },
    rows,
  };
}
