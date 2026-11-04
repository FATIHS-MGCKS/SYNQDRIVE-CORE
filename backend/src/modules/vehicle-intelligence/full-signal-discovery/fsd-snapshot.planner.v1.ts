import type { FsdBudgetConfigV1 } from './fsd-budget.contract.v1';
import type { FsdUnsupportedPlanningReasonV1 } from './fsd-evidence.contract.v1';
import { createPlannerStageEvidenceDimensions } from './fsd-evidence.contract.v1';
import { normalizeDeclaredFieldNames } from './fsd-graphql-field.util.v1';
import {
  buildFsdSignalsLatestQueryDocument,
  type FsdPlannedQueryDocumentV1,
} from './fsd-query-document.builder.v1';
import {
  buildFsdSnapshotSelectionForSignal,
} from './fsd-selection.builder.v1';
import {
  classifyDeclaredFsdSignals,
  type FsdClassifiedSignalV1,
} from './fsd-signal-shape.classifier.v1';

export type FsdSnapshotSignalPlanV1 = {
  fieldName: string;
  classified: FsdClassifiedSignalV1;
  evidence: ReturnType<typeof createPlannerStageEvidenceDimensions>;
  unsupportedReason?: FsdUnsupportedPlanningReasonV1;
};

export type FsdSnapshotPlanV1 = {
  documents: FsdPlannedQueryDocumentV1[];
  catalogSignals: FsdSnapshotSignalPlanV1[];
  deferredSignals: FsdSnapshotSignalPlanV1[];
};

function chunkFields<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function planFsdSnapshotQueries(input: {
  tokenId: number;
  declaredFieldNames: readonly string[];
  budget: FsdBudgetConfigV1;
}): FsdSnapshotPlanV1 {
  const normalized = normalizeDeclaredFieldNames(input.declaredFieldNames);
  const classified = classifyDeclaredFsdSignals(normalized);

  const plannable: Array<{
    signal: FsdClassifiedSignalV1;
    selection: string;
  }> = [];
  const catalogSignals: FsdSnapshotSignalPlanV1[] = [];
  const deferredSignals: FsdSnapshotSignalPlanV1[] = [];

  for (const signal of classified) {
    const selection = buildFsdSnapshotSelectionForSignal(signal);
    const schemaCompatible = signal.shape !== 'UNKNOWN';
    if (!selection) {
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible,
          queryPlanned: false,
          notEvaluable: true,
        }),
        unsupportedReason:
          signal.shape === 'UNKNOWN'
            ? 'UNKNOWN_SHAPE_NOT_PLANNED_IN_FSD1'
            : 'NOT_DECLARED',
      });
      continue;
    }

    const entry: FsdSnapshotSignalPlanV1 = {
      fieldName: signal.fieldName,
      classified: signal,
      evidence: createPlannerStageEvidenceDimensions({
        declared: true,
        schemaCompatible,
        queryPlanned: true,
        notEvaluable: false,
      }),
    };
    catalogSignals.push(entry);
    plannable.push({ signal, selection });
  }

  const maxDocs = Math.max(
    1,
    Math.ceil(plannable.length / input.budget.maxSnapshotFieldsPerDocument),
  );
  const maxPlannableFields = maxDocs * input.budget.maxSnapshotFieldsPerDocument;

  const toPlan = plannable.slice(0, maxPlannableFields);
  const overflow = plannable.slice(maxPlannableFields);
  for (const item of overflow) {
    deferredSignals.push({
      fieldName: item.signal.fieldName,
      classified: item.signal,
      evidence: createPlannerStageEvidenceDimensions({
        declared: true,
        schemaCompatible: item.signal.shape !== 'UNKNOWN',
        queryPlanned: false,
        notEvaluable: true,
      }),
      unsupportedReason: 'DEFERRED_BY_REQUEST_BUDGET',
    });
  }

  const documents: FsdPlannedQueryDocumentV1[] = [];
  for (const group of chunkFields(toPlan, input.budget.maxSnapshotFieldsPerDocument)) {
    const selections = group.map((g) => g.selection);
    const fieldNames = group.map((g) => g.signal.fieldName);
    documents.push(
      buildFsdSignalsLatestQueryDocument({
        tokenId: input.tokenId,
        selections,
        fieldNames,
      }),
    );
  }

  return { documents, catalogSignals, deferredSignals };
}
