import type { FsdBudgetConfigV1 } from '../fsd-budget.contract.v1';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';

export type Fsd4OrchestrationRunResultV1 =
  | { status: 'SKIPPED'; reason: string }
  | {
      status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      runId: string;
      catalogSignalCount: number;
      historicalChunksExecuted: number;
      signalsWithHistoricalCoverage: number;
      expectedBucketPositions: number;
      unknownOutcomeStage: boolean;
      failureReason?: string;
    };

export type Fsd4OrchestrationInputV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  historicalRequestKey: string;
  historicalWindow: FsdHistoricalWindowV1;
  leaseOwner: string;
  leaseExpiresAt: Date;
  budget?: FsdBudgetConfigV1;
  /**
   * When set, reuse catalog fingerprint and signal list from this completed FSD-3 run
   * (same source link, terminal COMPLETED, CATALOG succeeded). Skips catalog provider dispatch.
   */
  verifiedFsd3CatalogRunId?: string;
  expectedDeclaredCatalogFingerprint?: string;
};

export type Fsd4OrchestrationTestHooksV1 = {
  afterCatalogRequestSlotReserved?: () => void | Promise<void>;
  afterHistoricalRequestSlotReserved?: (chunkIndex: number) => void | Promise<void>;
  afterHistoricalProviderResponse?: (chunkIndex: number) => void | Promise<void>;
  afterHistoricalChunkCompleted?: (chunkIndex: number) => void | Promise<void>;
};
