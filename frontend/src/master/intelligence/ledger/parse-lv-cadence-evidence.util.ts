function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type VsiLvCadenceEvidenceView = {
  standbyProfile: string | null;
  classificationDecisionCode: string | null;
  evidenceConfidence: string | null;
  observedSampleCount: number | null;
  provenance: string[];
  limitations: string[];
};

/** Defensive parse of lvStandbyTransmissionProfile inside cadenceIntelligence. */
export function parseLvCadenceEvidence(
  cadenceIntelligence: Record<string, unknown> | null | undefined,
): VsiLvCadenceEvidenceView | null {
  const cadence = asRecord(cadenceIntelligence);
  if (!cadence) return null;
  const lv = asRecord(cadence.lvStandbyTransmissionProfile);
  if (!lv && !cadence.provenance) return null;

  const provenanceRaw = cadence.provenance;
  const provenance = Array.isArray(provenanceRaw)
    ? provenanceRaw.filter((p): p is string => typeof p === 'string')
    : [];

  const limitationsRaw = lv?.limitations ?? cadence.limitations;
  const limitations = Array.isArray(limitationsRaw)
    ? limitationsRaw.filter((c): c is string => typeof c === 'string')
    : [];

  if (!lv && provenance.length === 0 && limitations.length === 0) {
    return null;
  }

  return {
    standbyProfile: asString(lv?.profile),
    classificationDecisionCode: asString(lv?.classificationDecisionCode),
    evidenceConfidence: asString(lv?.evidenceConfidence),
    observedSampleCount:
      asFiniteNumber(cadence.observedSampleCount) ?? asFiniteNumber(cadence.distinctTimestampCount),
    provenance,
    limitations,
  };
}
