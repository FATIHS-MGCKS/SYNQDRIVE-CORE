import type { Ds4ColdEngineProxyKindV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type {
  DbiP2c2B2EvidenceParticipantV1,
  DbiP2c2PowertrainProxyCandidatesPlaneV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { classificationIsPositiveProxy } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.shared.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const REQUIRED_B2_SUBTYPES: readonly Ds4ColdEngineProxyKindV1[] = [
  'COLD_ENGINE_HIGH_LOAD',
  'COLD_ENGINE_HIGH_RPM',
  'COLD_ENGINE_FULL_THROTTLE',
] as const;

const MAX_REASON_CODE_ENTRIES = 512;
const MAX_STRING_FIELD_LENGTH = 2048;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_REASON_CODE_ENTRIES) return false;
  return value.every((entry) => typeof entry === 'string' && entry.length <= MAX_STRING_FIELD_LENGTH);
}

function isValidSubtypeStatus(status: unknown): status is 'ASSESSABLE' | 'NOT_ASSESSABLE' {
  return status === 'ASSESSABLE' || status === 'NOT_ASSESSABLE';
}

function validateSubtypeEntry(
  entry: unknown,
  codes: DbiP2c3ReconciliationDiagnosticCodeV1[],
): void {
  if (!isPlainObject(entry)) {
    codes.push('B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
    return;
  }
  if (!isValidSubtypeStatus(entry.status)) {
    codes.push('B2_SUBTYPE_STATUS_INVALID');
  }
  if (!isStringArray(entry.reasonCodes)) {
    codes.push('B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
  }
}

export function validateB2SubtypeAssessabilityCompleteness(
  plane: DbiP2c2PowertrainProxyCandidatesPlaneV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const participant = plane.participant;
  if (participant.sourceModule !== 'P2-B2') return [];

  const b2 = participant as DbiP2c2B2EvidenceParticipantV1;
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  const map = b2.subtypeAssessability;

  if (!isPlainObject(map)) {
    codes.push('B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
    return [...new Set(codes)].sort();
  }

  for (const kind of REQUIRED_B2_SUBTYPES) {
    const entry = (map as Record<string, unknown>)[kind];
    if (entry === undefined) {
      codes.push('B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
      continue;
    }
    validateSubtypeEntry(entry, codes);
  }

  for (const key of Object.keys(map)) {
    if (!(REQUIRED_B2_SUBTYPES as readonly string[]).includes(key)) {
      codes.push('B2_SUBTYPE_ASSESSABILITY_EXTRA_KEY');
    }
  }

  const positiveClassToKind: Record<string, Ds4ColdEngineProxyKindV1> = {
    COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE: 'COLD_ENGINE_HIGH_LOAD',
    COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE: 'COLD_ENGINE_HIGH_RPM',
    COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE: 'COLD_ENGINE_FULL_THROTTLE',
  };

  for (const cand of plane.candidates) {
    if (cand.sourceModule !== 'P2-B2') continue;
    const resolveSubtypeKind = (): Ds4ColdEngineProxyKindV1 => {
      if (classificationIsPositiveProxy(cand.originalClassification)) {
        const fromClass = positiveClassToKind[cand.originalClassification];
        if (fromClass) return fromClass;
      }
      return cand.proxyKind;
    };
    const kind = resolveSubtypeKind();
    const entry = (map as Record<string, unknown>)[kind];
    if (entry === undefined) {
      codes.push('B2_SUBTYPE_ASSESSABILITY_INCOMPLETE');
      continue;
    }
    validateSubtypeEntry(entry, codes);
    if (classificationIsPositiveProxy(cand.originalClassification)) {
      if (isPlainObject(entry) && entry.status === 'NOT_ASSESSABLE') {
        codes.push('B2_PARTICIPANT_SUBTYPE_ASSESSABILITY_CONTRADICTION');
      }
    }
  }

  return [...new Set(codes)].sort();
}
