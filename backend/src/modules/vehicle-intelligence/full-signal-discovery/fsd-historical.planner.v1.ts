import {
  type FsdBudgetConfigV1,
  type FsdBudgetValidationResultV1,
  normalizeFsdBudgetConfigV1,
  validateHistoricalWindowForPlanning,
  validatePlannedRequestCount,
} from './fsd-budget.contract.v1';
import type { FsdUnsupportedPlanningReasonV1 } from './fsd-evidence.contract.v1';
import { createPlannerStageEvidenceDimensions } from './fsd-evidence.contract.v1';
import { normalizeDeclaredFieldNames } from './fsd-graphql-field.util.v1';
import {
  buildFsdHistoricalSignalsQueryDocument,
  type FsdHistoricalWindowV1,
  type FsdPlannedQueryDocumentV1,
} from './fsd-query-document.builder.v1';
import {
  buildFsdHistoricalSelectionsForFields,
} from './fsd-selection.builder.v1';
import {
  classifyDeclaredFsdSignals,
  classifyFsdSignalShape,
  type FsdClassifiedSignalV1,
} from './fsd-signal-shape.classifier.v1';
import { computeHistoricalWindowSecondsFromIso } from './fsd-coverage.calculator.v1';

export type FsdHistoricalSignalPlanV1 = {
  fieldName: string;
  classified: FsdClassifiedSignalV1;
  evidence: ReturnType<typeof createPlannerStageEvidenceDimensions>;
  unsupportedReason?: FsdUnsupportedPlanningReasonV1;
};

export type FsdHistoricalChunkPlanV1 = {
  chunkIndex: number;
  documents: FsdPlannedQueryDocumentV1;
  fieldNames: string[];
  shapeMix: 'FLOAT_ONLY' | 'LOCATION_ONLY';
};

export type FsdHistoricalPlanV1 = {
  window: FsdHistoricalWindowV1;
  windowSeconds: number;
  expectedBucketPositions: number;
  chunks: FsdHistoricalChunkPlanV1[];
  catalogSignals: FsdHistoricalSignalPlanV1[];
  deferredSignals: FsdHistoricalSignalPlanV1[];
  budgetValidation: FsdBudgetValidationResultV1;
};

function chunkSortedSignals(
  signals: FsdClassifiedSignalV1[],
  chunkSize: number,
): FsdClassifiedSignalV1[][] {
  const safeChunkSize = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : 0;
  if (signals.length === 0 || safeChunkSize <= 0) {
    return [];
  }
  const chunks: FsdClassifiedSignalV1[][] = [];
  for (let i = 0; i < signals.length; i += safeChunkSize) {
    chunks.push(signals.slice(i, i + safeChunkSize));
  }
  return chunks;
}

export function planFsdHistoricalQueries(input: {
  tokenId: number;
  declaredFieldNames: readonly string[];
  window: FsdHistoricalWindowV1;
  budget: FsdBudgetConfigV1;
  /** Max historical GraphQL documents allowed for this plan (remaining run budget slot). */
  maxPlannedHistoricalRequests?: number;
  /** When true, isolate speed into its own historical document (P2E R1 pattern). */
  isolateSpeedSignal?: boolean;
}): FsdHistoricalPlanV1 {
  const budget = normalizeFsdBudgetConfigV1(input.budget);
  const normalized = normalizeDeclaredFieldNames(input.declaredFieldNames);
  const classified = classifyDeclaredFsdSignals(normalized);
  const windowCheck = validateHistoricalWindowForPlanning(input.window, budget);
  if (!windowCheck.ok) {
    return {
      window: input.window,
      windowSeconds: 0,
      expectedBucketPositions: 0,
      chunks: [],
      catalogSignals: classified.map((signal) => ({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: signal.shape !== 'UNKNOWN',
          queryPlanned: false,
          notEvaluable: true,
        }),
      })),
      deferredSignals: [],
      budgetValidation: {
        ok: false,
        reason: windowCheck.reason,
        plannedRequestCount: 0,
        limit: windowCheck.limit,
      },
    };
  }

  const windowSeconds = computeHistoricalWindowSecondsFromIso(input.window);

  const catalogSignals: FsdHistoricalSignalPlanV1[] = [];
  const floatSignals: FsdClassifiedSignalV1[] = [];
  const locationSignals: FsdClassifiedSignalV1[] = [];
  const deferredSignals: FsdHistoricalSignalPlanV1[] = [];

  for (const signal of classified) {
    const schemaCompatible = signal.shape !== 'UNKNOWN';
    if (signal.shape === 'UNKNOWN') {
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: false,
          queryPlanned: false,
          notEvaluable: true,
        }),
        unsupportedReason: 'UNKNOWN_SHAPE_NOT_PLANNED_IN_FSD1',
      });
      continue;
    }
    if (signal.shape === 'STRING') {
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: true,
          queryPlanned: false,
          notEvaluable: true,
        }),
        unsupportedReason: 'STRING_HISTORICAL_UNSUPPORTED',
      });
      continue;
    }
    if (signal.shape === 'LOCATION') {
      locationSignals.push(signal);
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
        }),
      });
      continue;
    }
    if (signal.shape === 'FLOAT') {
      floatSignals.push(signal);
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
        }),
      });
    }
  }

  const chunks: FsdHistoricalChunkPlanV1[] = [];
  let chunkIndex = 0;

  const floatsSorted = [...floatSignals].sort((a, b) => a.fieldName.localeCompare(b.fieldName));
  let remainingFloats = floatsSorted;

  if (input.isolateSpeedSignal !== false) {
    const speedIdx = remainingFloats.findIndex((s) => s.fieldName === 'speed');
    if (speedIdx >= 0) {
      const speedOnly = [remainingFloats[speedIdx]!];
      remainingFloats = remainingFloats.filter((s) => s.fieldName !== 'speed');
      const { selections, fieldNames } = buildFsdHistoricalSelectionsForFields(speedOnly);
      chunks.push({
        chunkIndex: chunkIndex++,
        documents: buildFsdHistoricalSignalsQueryDocument({
          tokenId: input.tokenId,
          window: input.window,
          selections,
          fieldNames,
          operationName: 'FsdHistoricalSpeed',
        }),
        fieldNames,
        shapeMix: 'FLOAT_ONLY',
      });
    }
  }

  for (const group of chunkSortedSignals(
    remainingFloats,
    budget.maxHistoricalFloatFieldsPerChunk,
  )) {
    const { selections, fieldNames } = buildFsdHistoricalSelectionsForFields(group);
    if (selections.length === 0) {
      continue;
    }
    chunks.push({
      chunkIndex: chunkIndex++,
      documents: buildFsdHistoricalSignalsQueryDocument({
        tokenId: input.tokenId,
        window: input.window,
        selections,
        fieldNames,
        operationName: `FsdHistoricalFloat${chunkIndex}`,
      }),
      fieldNames,
      shapeMix: 'FLOAT_ONLY',
    });
  }

  for (const location of locationSignals) {
    const { selections, fieldNames } = buildFsdHistoricalSelectionsForFields([location]);
    chunks.push({
      chunkIndex: chunkIndex++,
      documents: buildFsdHistoricalSignalsQueryDocument({
        tokenId: input.tokenId,
        window: input.window,
        selections,
        fieldNames,
        operationName: 'FsdHistoricalLocation',
      }),
      fieldNames,
      shapeMix: 'LOCATION_ONLY',
    });
  }

  const maxHistoricalChunks = Math.max(
    0,
    input.maxPlannedHistoricalRequests ?? budget.maxRequestsPerRun,
  );
  const allowedChunks = chunks.slice(0, maxHistoricalChunks);
  const overflowChunks = chunks.slice(maxHistoricalChunks);

  for (const overflow of overflowChunks) {
    for (const fieldName of overflow.fieldNames) {
      deferredSignals.push({
        fieldName,
        classified: classifyFsdSignalShape(fieldName)!,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible: true,
          queryPlanned: false,
          notEvaluable: true,
        }),
        unsupportedReason: 'DEFERRED_BY_REQUEST_BUDGET',
      });
    }
  }

  const budgetValidation = validatePlannedRequestCount(allowedChunks.length, budget);

  const expectedBucketPositions = Math.ceil(windowSeconds);

  return {
    window: input.window,
    windowSeconds,
    expectedBucketPositions,
    chunks: allowedChunks,
    catalogSignals,
    deferredSignals,
    budgetValidation,
  };
}

export function historicalPlanViolatesLocationIsolation(plan: FsdHistoricalPlanV1): boolean {
  for (const chunk of plan.chunks) {
    if (chunk.shapeMix === 'LOCATION_ONLY' && chunk.fieldNames.length !== 1) {
      return true;
    }
    if (chunk.shapeMix === 'LOCATION_ONLY' && chunk.documents.fieldNames.some((f) => {
      const c = classifyDeclaredFsdSignals([f])[0];
      return c?.shape === 'FLOAT';
    })) {
      return true;
    }
    if (chunk.shapeMix === 'FLOAT_ONLY') {
      for (const name of chunk.fieldNames) {
        const c = classifyDeclaredFsdSignals([name])[0];
        if (c?.shape === 'LOCATION') {
          return true;
        }
      }
    }
  }
  return false;
}
