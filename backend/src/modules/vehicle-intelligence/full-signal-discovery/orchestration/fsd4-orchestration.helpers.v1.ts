import type { FsdDiscoveryRunOrchestrationBundleV1 } from '../persistence/fsd-discovery-persistence.repository';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';
import {
  parseFsd4CatalogStageCheckpoint,
  parseFsd4HistoricalProgressCheckpoint,
  parseHistoricalWindowFromCheckpointJson,
  type Fsd4CatalogStageCheckpointV1,
} from './fsd4-request-ledger.v1';
import type { Fsd4OrchestrationRunResultV1 } from './fsd4-orchestration.types.v1';

export function findStageInBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
  stageType: 'CATALOG' | 'HISTORICAL',
) {
  return bundle.stages.find((s) => s.stageType === stageType) ?? null;
}

export function readCatalogCheckpointFromBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
): Fsd4CatalogStageCheckpointV1 | null {
  const stage = findStageInBundle(bundle, 'CATALOG');
  if (!stage) {
    return null;
  }
  return parseFsd4CatalogStageCheckpoint(stage.checkpointJson);
}

export function buildSkippedResult(reason: string): Fsd4OrchestrationRunResultV1 {
  return { status: 'SKIPPED', reason };
}

export function buildTerminalFailureResult(input: {
  runId?: string;
  reason?: string;
  catalogSignalCount?: number;
  historicalChunksExecuted?: number;
}): Fsd4OrchestrationRunResultV1 {
  return {
    status: 'FAILED',
    runId: input.runId ?? '',
    catalogSignalCount: input.catalogSignalCount ?? 0,
    historicalChunksExecuted: input.historicalChunksExecuted ?? 0,
    signalsWithHistoricalCoverage: 0,
    expectedBucketPositions: 0,
    unknownOutcomeStage: false,
    failureReason: input.reason,
  };
}

export function parseHistoricalProgressFromBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
): ReturnType<typeof parseFsd4HistoricalProgressCheckpoint> {
  return parseFsd4HistoricalProgressCheckpoint(findStageInBundle(bundle, 'HISTORICAL')?.checkpointJson);
}

export function readHistoricalWindowFromBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
): FsdHistoricalWindowV1 | null {
  return parseHistoricalWindowFromCheckpointJson(findStageInBundle(bundle, 'HISTORICAL')?.checkpointJson);
}
