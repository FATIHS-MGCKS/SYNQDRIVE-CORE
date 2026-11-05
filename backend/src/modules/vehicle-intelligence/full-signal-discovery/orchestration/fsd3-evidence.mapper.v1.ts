import type { FsdDiscoverySignalEvidenceState } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { FsdEvidenceDimensionsV1 } from '../fsd-evidence.contract.v1';
import type { FsdClassifiedSignalV1 } from '../fsd-signal-shape.classifier.v1';
import type { Fsd3ProviderSnapshotFieldValueV1 } from './fsd3-provider.port.v1';

export function mapFsd3CatalogEvidenceState(input: {
  listedInCatalog: boolean;
  classified: FsdClassifiedSignalV1;
}): FsdDiscoverySignalEvidenceState {
  if (!input.listedInCatalog) {
    return 'NOT_EVALUABLE';
  }
  if (input.classified.shape === 'UNKNOWN') {
    return 'NOT_EVALUABLE';
  }
  return 'DECLARED_ONLY';
}

export function mapFsd3PlannerEvidenceToPersistenceState(
  evidence: FsdEvidenceDimensionsV1,
): FsdDiscoverySignalEvidenceState {
  if (evidence.notEvaluable) {
    return 'NOT_EVALUABLE';
  }
  if (evidence.queryFailed) {
    return 'QUERY_FAILED';
  }
  if (evidence.queryAccepted && evidence.observedValue) {
    return 'OBSERVED';
  }
  if (evidence.queryAccepted && evidence.observedNull) {
    return 'OBSERVED';
  }
  if (evidence.queryAccepted) {
    return 'QUERY_ACCEPTED';
  }
  if (evidence.queryPlanned) {
    return 'QUERY_PLANNED';
  }
  return 'DECLARED_ONLY';
}

export function applyFsd3SnapshotObservationToDimensions(
  base: FsdEvidenceDimensionsV1,
  observation: Fsd3ProviderSnapshotFieldValueV1 | undefined,
  queryAccepted: boolean,
): FsdEvidenceDimensionsV1 {
  if (!queryAccepted) {
    return base;
  }
  if (!observation) {
    return {
      ...base,
      queryAccepted: true,
      notObserved: true,
    };
  }
  switch (observation.kind) {
    case 'NULL':
      return { ...base, queryAccepted: true, observedNull: true, observedValue: false };
    case 'MISSING':
      return { ...base, queryAccepted: true, notObserved: true };
    case 'VALID_ZERO':
      return { ...base, queryAccepted: true, observedValue: true, observedNull: false };
    case 'VALID_NONZERO':
      return { ...base, queryAccepted: true, observedValue: true, observedNull: false };
    case 'INVALID':
    default:
      return { ...base, queryAccepted: false, queryFailed: true };
  }
}

export function buildFsd3EvidenceQualityJson(input: {
  shape: string;
  observationKind?: string;
  dimensions: FsdEvidenceDimensionsV1;
}): Prisma.InputJsonValue {
  return {
    shape: input.shape,
    observationKind: input.observationKind ?? null,
    declared: input.dimensions.declared,
    schemaCompatible: input.dimensions.schemaCompatible,
    queryPlanned: input.dimensions.queryPlanned,
    queryAccepted: input.dimensions.queryAccepted ?? null,
    observedValue: input.dimensions.observedValue ?? null,
    observedNull: input.dimensions.observedNull ?? null,
    notObserved: input.dimensions.notObserved ?? null,
  };
}
