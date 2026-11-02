import type {
  MasterVsiProfileDetailDto,
  MasterVsiProfileSummaryDto,
  MasterVsiSignalDetailDto,
} from './vsi-master-intelligence-api.types';

export const ENGINE_RPM_CANONICAL_KEY = 'engine_rpm';

export type VsiEngineRpmTripClassificationView = {
  tripId: string;
  profile: string;
  decisionCode: string;
  rpmPointCount: number | null;
};

export type VsiEngineRpmCadenceEvidenceView = {
  hasHfEvidence: boolean;
  observedSampleCount: number | null;
  finalizedTripCount: number | null;
  provenance: string[];
  activeRpmProfile: string | null;
  classificationDecisionCode: string | null;
  classificationDecisionSummary: string | null;
  tripClassifications: VsiEngineRpmTripClassificationView[];
};

export type VsiEngineRpmSnapshotEvidenceView = {
  empiricalObservation: string;
  freshnessClassification: string | null;
  lastValidObservationAt: string | null;
  qualityClassification: string | null;
  confidenceLevel: string | null;
  evidenceProvenance: string[];
};

export type VsiEngineRpmDualProvenanceView = {
  snapshot: VsiEngineRpmSnapshotEvidenceView;
  cadence: VsiEngineRpmCadenceEvidenceView;
  profileEvaluatedAt: string | null;
  rpmApplicability: MasterVsiProfileSummaryDto['rpmApplicability'];
  combinedEvidenceAvailabilityV1: MasterVsiSignalDetailDto['rpmCombinedEvidenceAvailabilityV1'];
  combinedEvidenceLimitationsV1: string[];
  showDualPanel: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseTripClassifications(raw: unknown): VsiEngineRpmTripClassificationView[] {
  if (!Array.isArray(raw)) return [];
  const out: VsiEngineRpmTripClassificationView[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const tripId = asString(row.tripId);
    const profile = asString(row.profile);
    const decisionCode = asString(row.decisionCode);
    if (!tripId || !profile || !decisionCode) continue;
    out.push({
      tripId,
      profile,
      decisionCode,
      rpmPointCount: asFiniteNumber(row.rpmPointCount),
    });
  }
  return out;
}

/** Parses cadenceIntelligence from API (persisted VSI profile snapshot). */
export function parseEngineRpmCadenceEvidence(
  signal: MasterVsiSignalDetailDto,
): VsiEngineRpmCadenceEvidenceView {
  const cadence = asRecord(signal.cadenceIntelligence);
  const provenanceRaw = cadence?.provenance;
  const provenance = Array.isArray(provenanceRaw)
    ? provenanceRaw.filter((p): p is string => typeof p === 'string')
    : [];

  const observedSampleCount =
    asFiniteNumber(cadence?.observedSampleCount) ?? asFiniteNumber(cadence?.distinctTimestampCount);

  const activeRpm = asRecord(cadence?.activeRpmProfile);
  const tripClassifications = parseTripClassifications(activeRpm?.tripClassifications);

  const regimeSampleSum = Array.isArray(cadence?.regimes)
    ? cadence!.regimes.reduce((sum, r) => {
        const row = asRecord(r);
        const n = row ? asFiniteNumber(row.sampleCount) : null;
        return sum + (n ?? 0);
      }, 0)
    : 0;

  const hasHfEvidence =
    provenance.some((p) => p.includes('CLICKHOUSE') || p.includes('HF')) ||
    (observedSampleCount != null && observedSampleCount > 0) ||
    regimeSampleSum > 0 ||
    tripClassifications.length > 0;

  return {
    hasHfEvidence,
    observedSampleCount,
    finalizedTripCount: asFiniteNumber(cadence?.finalizedTripCount),
    provenance,
    activeRpmProfile: asString(activeRpm?.activeProfile),
    classificationDecisionCode: asString(activeRpm?.classificationDecisionCode),
    classificationDecisionSummary: asString(activeRpm?.classificationDecisionSummary),
    tripClassifications,
  };
}

export function parseEngineRpmSnapshotEvidence(
  signal: MasterVsiSignalDetailDto,
): VsiEngineRpmSnapshotEvidenceView {
  return {
    empiricalObservation: signal.empiricalObservation,
    freshnessClassification: signal.freshnessClassification,
    lastValidObservationAt: signal.lastValidObservationAt,
    qualityClassification: signal.qualityClassification,
    confidenceLevel: signal.confidenceLevel,
    evidenceProvenance: signal.evidenceProvenance ?? [],
  };
}

export function buildEngineRpmDualProvenanceView(
  profile: MasterVsiProfileDetailDto,
  signal: MasterVsiSignalDetailDto,
): VsiEngineRpmDualProvenanceView {
  return {
    snapshot: parseEngineRpmSnapshotEvidence(signal),
    cadence: parseEngineRpmCadenceEvidence(signal),
    profileEvaluatedAt: profile.evaluatedAt,
    rpmApplicability:
      signal.empiricalObservation === 'NOT_APPLICABLE' ||
      signal.powertrainApplicability === 'NOT_APPLICABLE'
        ? 'NOT_APPLICABLE'
        : profile.rpmApplicability,
    combinedEvidenceAvailabilityV1: signal.rpmCombinedEvidenceAvailabilityV1 ?? null,
    combinedEvidenceLimitationsV1: signal.rpmCombinedEvidenceLimitationsV1 ?? [],
    showDualPanel: signal.canonicalSignalKey === ENGINE_RPM_CANONICAL_KEY,
  };
}
