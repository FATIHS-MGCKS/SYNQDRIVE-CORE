import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const MAX_REASON_CODE_ENTRIES = 512;
const MAX_STRING_FIELD_LENGTH = 2048;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_STRING_FIELD_LENGTH;
}

function isStringArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_REASON_CODE_ENTRIES) return false;
  return value.every((entry) => typeof entry === 'string' && entry.length <= MAX_STRING_FIELD_LENGTH);
}

function push(codes: DbiP2c3ReconciliationDiagnosticCodeV1[], code: DbiP2c3ReconciliationDiagnosticCodeV1): void {
  codes.push(code);
}

function requireStringArray(participant: Record<string, unknown>, key: string, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!(key in participant) || !isStringArray(participant[key])) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

function validateSemanticGuards(guards: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(guards)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (typeof guards.notEvidenceCandidate !== 'boolean') {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (typeof guards.labelsNotForCrossDomainJoin !== 'boolean') {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

function validateA1HighEpisodesMeta(meta: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(meta)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (!boundedString(meta.status)) push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (typeof meta.rejectedCandidateCount !== 'number') push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (!isPlainObject(meta.countRange)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  } else {
    if (typeof meta.countRange.min !== 'number' || typeof meta.countRange.max !== 'number') {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if (!isPlainObject(meta.thresholds)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  } else {
    for (const k of ['highEntryU', 'highExitU', 'nearMaxEntryU', 'nearMaxExitU'] as const) {
      if (typeof meta.thresholds[k] !== 'number') push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if ('massAccounting' in meta && meta.massAccounting !== null && !isPlainObject(meta.massAccounting)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

function validateA1ModuleAssessability(assessability: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(assessability)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (!boundedString(assessability.highEpisodesStatus)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (typeof assessability.normalizedEpisodesEligible !== 'boolean') {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (!('semanticGuards' in assessability)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  } else {
    validateSemanticGuards(assessability.semanticGuards, codes);
  }
}

function validateB4FacetProjection(facet: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(facet)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (facet.assessability !== 'ASSESSABLE' && facet.assessability !== 'NOT_ASSESSABLE') {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (!boundedString(facet.tripEvidenceClassification)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (!('assessabilityReasonCodes' in facet) || !isStringArray(facet.assessabilityReasonCodes)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (!isPlainObject(facet.coverageDiagnostics)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (typeof facet.entryLabelCount !== 'number') push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (typeof facet.deduplicatedCandidateCount !== 'number') push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
}

function validateB3PartialCoverage(coverage: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(coverage)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  const numericKeys = [
    'canonicalRowsFullKey',
    'distinctMsLabelsInTrip',
    'identicalDuplicateCollapsedCount',
    'loadPresentBucketCount',
    'loadMissingBucketCount',
    'gridBucketCount',
    'entryLabelCount',
  ] as const;
  for (const key of numericKeys) {
    if (typeof coverage[key] !== 'number') push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

export function validateParticipantRequiredAdapterFields(
  participant: unknown,
  codes: DbiP2c3ReconciliationDiagnosticCodeV1[],
): void {
  if (!isPlainObject(participant)) return;

  requireStringArray(participant, 'originalAbstainReasons', codes);
  requireStringArray(participant, 'unsupportedScientificClaims', codes);
  requireStringArray(participant, 'moduleScientificLimitationCodes', codes);
  requireStringArray(participant, 'candidateLimitationCodes', codes);

  if (!('adapterClaimsPositiveEvidence' in participant) || typeof participant.adapterClaimsPositiveEvidence !== 'boolean') {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }

  const module = participant.sourceModule;
  if (module === 'P2-A1') {
    if (!('moduleAssessability' in participant)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    } else {
      validateA1ModuleAssessability(participant.moduleAssessability, codes);
    }
    if (!('highEpisodesMeta' in participant)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    } else {
      validateA1HighEpisodesMeta(participant.highEpisodesMeta, codes);
    }
  }
  if (module === 'P2-B1' || module === 'P2-B2') {
    if (!isPlainObject(participant.moduleCoverage)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if (module === 'P2-B2' && !isPlainObject(participant.subtypeAssessability)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (module === 'P2-B3') {
    if (!boundedString(participant.tripEvidenceClassification)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
    if (!('partialCoverage' in participant)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    } else {
      validateB3PartialCoverage(participant.partialCoverage, codes);
    }
  }
  if (module === 'P2-B4') {
    if (!('facetA' in participant)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    } else {
      validateB4FacetProjection(participant.facetA, codes);
    }
    if (!('facetB' in participant)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    } else {
      validateB4FacetProjection(participant.facetB, codes);
    }
  }
}
