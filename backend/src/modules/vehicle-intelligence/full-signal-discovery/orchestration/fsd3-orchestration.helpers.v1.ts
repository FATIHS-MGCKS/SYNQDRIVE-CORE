import type { FsdDiscoveryRunOrchestrationBundleV1 } from '../persistence/fsd-discovery-persistence.repository';
import {
  parseFsd3CatalogStageCheckpoint,
  parseFsd3SnapshotStageCheckpoint,
  type Fsd3CatalogStageCheckpointV1,
} from './fsd3-request-ledger.v1';
import type { Fsd3OrchestrationRunResultV1 } from './fsd3-orchestration.service.v1';

export function findStageInBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
  stageType: 'CATALOG' | 'SNAPSHOT',
) {
  return bundle.stages.find((s) => s.stageType === stageType) ?? null;
}

export function readCatalogCheckpointFromBundle(
  bundle: FsdDiscoveryRunOrchestrationBundleV1,
): Fsd3CatalogStageCheckpointV1 | null {
  const stage = findStageInBundle(bundle, 'CATALOG');
  if (!stage) {
    return null;
  }
  return parseFsd3CatalogStageCheckpoint(stage.checkpointJson);
}

export function buildTerminalFailureResult(input: {
  runId: string;
  catalogSignalCount?: number;
  reason?: string;
}): Fsd3OrchestrationRunResultV1 {
  return {
    status: 'FAILED',
    runId: input.runId,
    catalogSignalCount: input.catalogSignalCount ?? 0,
    snapshotDocumentsExecuted: 0,
    observedSignalCount: 0,
    unknownOutcomeStage: false,
    failureReason: input.reason,
  };
}

export function buildSkippedResult(reason: string): Fsd3OrchestrationRunResultV1 {
  return { status: 'SKIPPED', reason };
}
