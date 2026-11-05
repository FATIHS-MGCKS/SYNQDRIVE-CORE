import type { Prisma } from '@prisma/client';
import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  resolveMaxSnapshotDocumentsFromRemainingBudget,
  type FsdBudgetConfigV1,
} from '../fsd-budget.contract.v1';
import { FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 } from '../fsd-discovery.planner.v1';
import type { FsdEvidenceDimensionsV1 } from '../fsd-evidence.contract.v1';
import { interpretFsdGraphqlProviderResponse } from '../fsd-response.interpreter.v1';
import { classifyDeclaredFsdSignals } from '../fsd-signal-shape.classifier.v1';
import { planFsdSnapshotQueries } from '../fsd-snapshot.planner.v1';
import {
  buildFsdDiscoveryRunKey,
  buildFsdDimoConnectionIdentityFingerprint,
  type FsdDiscoveryRunIdentityV1,
  type FsdDiscoveryWriteAuthorizationV1,
} from '../persistence/fsd-discovery-persistence.contract.v1';
import type { FsdDiscoveryPersistenceRepository } from '../persistence/fsd-discovery-persistence.repository';
import {
  applyFsd3SnapshotObservationToDimensions,
  buildFsd3EvidenceQualityJson,
  mapFsd3CatalogEvidenceState,
  mapFsd3PlannerEvidenceToPersistenceState,
} from './fsd3-evidence.mapper.v1';
import {
  buildFsd3CatalogStagePlanFingerprintV1,
  buildFsd3DeclaredCatalogFingerprintV1,
  buildFsd3SnapshotStagePlanFingerprintV1,
} from './fsd3-fingerprint.v1';
import {
  assertFsd3VehicleAllowed,
  type Fsd3OrchestrationConfigV1,
} from './fsd3-orchestration.config.v1';
import type { Fsd3DiscoveryProviderPortV1 } from './fsd3-provider.port.v1';

export type Fsd3SnapshotStageCheckpointV1 = {
  nextDocumentIndex: number;
  rejectedQueryFingerprints: string[];
  completedDocumentFingerprints: string[];
};

export type Fsd3OrchestrationRunResultV1 =
  | { status: 'SKIPPED'; reason: string }
  | {
      status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      runId: string;
      catalogSignalCount: number;
      snapshotDocumentsExecuted: number;
      observedSignalCount: number;
      unknownOutcomeStage: boolean;
    };

export type Fsd3OrchestrationInputV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  budget?: FsdBudgetConfigV1;
};

function emptyCheckpoint(): Fsd3SnapshotStageCheckpointV1 {
  return {
    nextDocumentIndex: 0,
    rejectedQueryFingerprints: [],
    completedDocumentFingerprints: [],
  };
}

export class Fsd3CatalogSnapshotOrchestratorService {
  constructor(
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly provider: Fsd3DiscoveryProviderPortV1,
    private readonly config: Fsd3OrchestrationConfigV1,
  ) {}

  async runCatalogSnapshotDiscovery(
    input: Fsd3OrchestrationInputV1,
  ): Promise<Fsd3OrchestrationRunResultV1> {
    try {
      assertFsd3VehicleAllowed(this.config, input.vehicleId);
    } catch (err) {
      return { status: 'SKIPPED', reason: (err as Error).message };
    }

    const budget = normalizeFsdBudgetConfigV1(input.budget ?? createDefaultFsdBudgetConfigV1());
    const connectionIdentityFingerprint = buildFsdDimoConnectionIdentityFingerprint({
      dimoVehicleId: input.dimoVehicleId,
      tokenId: input.dimoTokenId,
    });

    const catalogResult = await this.provider.fetchAvailableSignals({
      tokenId: input.dimoTokenId,
    });
    const catalogFingerprint = buildFsd3DeclaredCatalogFingerprintV1(
      catalogResult.availableSignals,
    );
    const runKey = buildFsdDiscoveryRunKey({ declaredCatalogFingerprint: catalogFingerprint });

    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    };

    const identity: FsdDiscoveryRunIdentityV1 = {
      ...scope,
      runKey,
      dimoTokenId: input.dimoTokenId,
      connectionIdentityFingerprint,
    };

    const acquired = await this.persistence.acquireRunWithIdempotency(identity);
    if (acquired.kind === 'REPLAYED') {
      return {
        status: 'COMPLETED',
        runId: acquired.runId,
        catalogSignalCount: catalogResult.availableSignals.length,
        snapshotDocumentsExecuted: 0,
        observedSignalCount: 0,
        unknownOutcomeStage: false,
      };
    }

    const claimed = await this.persistence.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
    });
    if (!claimed) {
      return {
        status: 'FAILED',
        runId: acquired.runId,
        catalogSignalCount: 0,
        snapshotDocumentsExecuted: 0,
        observedSignalCount: 0,
        unknownOutcomeStage: false,
      };
    }

    let runVersion = acquired.version + 1;
    const writeAuth = (): FsdDiscoveryWriteAuthorizationV1 => ({
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: runVersion,
      leaseOwner: input.leaseOwner,
    });

    const runToInProgress = await this.persistence.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: runVersion,
      fromStatus: 'PENDING',
      toStatus: 'IN_PROGRESS',
    });
    if (runToInProgress.applied) {
      runVersion += 1;
    }

    const catalogPlanFingerprint = buildFsd3CatalogStagePlanFingerprintV1(catalogFingerprint);
    const catalogStage = await this.persistence.upsertStagePlan({
      auth: writeAuth(),
      stageType: 'CATALOG',
      planFingerprint: catalogPlanFingerprint,
    });

    let catalogStageVersion = 1;
    await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'CATALOG',
      expectedStageVersion: catalogStageVersion,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
    });
    catalogStageVersion += 1;

    const classified = classifyDeclaredFsdSignals(catalogResult.availableSignals);
    const catalogSet = new Set(catalogResult.availableSignals);
    for (const signal of classified) {
      const evidenceState = mapFsd3CatalogEvidenceState({
        listedInCatalog: catalogSet.has(signal.fieldName),
        classified: signal,
      });
      await this.persistence.recordSignalEvidence({
        ...writeAuth(),
        stageId: catalogStage.stageId,
        stageType: 'CATALOG',
        signalName: signal.fieldName,
        evidenceState,
        declaredByProvider: catalogSet.has(signal.fieldName),
        schemaShape: signal.shape,
        queryPlanned: false,
        provenanceJson: { source: 'availableSignals', listed: catalogSet.has(signal.fieldName) },
        qualityJson: buildFsd3EvidenceQualityJson({
          shape: signal.shape,
          dimensions: {
            declared: catalogSet.has(signal.fieldName),
            schemaCompatible: signal.shape !== 'UNKNOWN',
            queryPlanned: false,
            notEvaluable: evidenceState === 'NOT_EVALUABLE',
          },
        }),
      });
    }

    await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'CATALOG',
      expectedStageVersion: catalogStageVersion,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'SUCCEEDED',
    });
    catalogStageVersion += 1;

    const remainingDocs = resolveMaxSnapshotDocumentsFromRemainingBudget(
      budget.maxRequestsPerRun - FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    );
    const snapshotPlan = planFsdSnapshotQueries({
      tokenId: input.dimoTokenId,
      declaredFieldNames: catalogResult.availableSignals,
      budget,
      maxSnapshotDocuments: remainingDocs,
    });

    const snapshotPlanFingerprint = buildFsd3SnapshotStagePlanFingerprintV1({
      catalogFingerprint,
      documentFingerprints: snapshotPlan.documents.map((d) => d.fingerprint),
    });

    const snapshotStage = await this.persistence.upsertStagePlan({
      auth: writeAuth(),
      stageType: 'SNAPSHOT',
      planFingerprint: snapshotPlanFingerprint,
    });

    for (const deferred of snapshotPlan.deferredSignals) {
      await this.persistence.recordSignalEvidence({
        ...writeAuth(),
        stageId: snapshotStage.stageId,
        stageType: 'SNAPSHOT',
        signalName: deferred.fieldName,
        evidenceState: 'DEFERRED',
        declaredByProvider: true,
        schemaShape: deferred.classified.shape,
        queryPlanned: false,
        qualityJson: buildFsd3EvidenceQualityJson({
          shape: deferred.classified.shape,
          dimensions: deferred.evidence,
        }),
      });
    }

    const checkpoint = emptyCheckpoint();
    let snapshotStageVersion = 1;
    await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'SNAPSHOT',
      expectedStageVersion: snapshotStageVersion,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
      checkpointJson: checkpoint as unknown as Prisma.InputJsonValue,
    });
    snapshotStageVersion += 1;

    let observedSignalCount = 0;
    let unknownOutcome = false;

    for (let index = checkpoint.nextDocumentIndex; index < snapshotPlan.documents.length; index++) {
      const document = snapshotPlan.documents[index];
      if (checkpoint.rejectedQueryFingerprints.includes(document.fingerprint)) {
        continue;
      }

      const providerResponse = await this.provider.executeSnapshotDocument({
        tokenId: input.dimoTokenId,
        queryText: document.queryText,
        documentFingerprint: document.fingerprint,
        fieldNamesInDocument: document.fieldNames,
      });

      const interpreted = interpretFsdGraphqlProviderResponse({
        fieldNamesInDocument: document.fieldNames,
        dataPresent: providerResponse.dataPresent,
        httpStatus: providerResponse.httpStatus,
        errors: providerResponse.errors,
      });

      if (providerResponse.httpStatus === 422) {
        if (!checkpoint.rejectedQueryFingerprints.includes(document.fingerprint)) {
          checkpoint.rejectedQueryFingerprints.push(document.fingerprint);
        }
        const cp = await this.persistence.advanceStageCheckpoint({
          auth: writeAuth(),
          stageType: 'SNAPSHOT',
          expectedStageVersion: snapshotStageVersion,
          planFingerprint: snapshotPlanFingerprint,
          checkpointJson: checkpoint as unknown as Prisma.InputJsonValue,
        });
        if (cp.applied) {
          snapshotStageVersion = cp.stageVersion;
        }
        continue;
      }

      if (interpreted.fields.some((f) => f.attribution === 'AMBIGUOUS')) {
        unknownOutcome = true;
        await this.persistence.transitionStageStatus({
          auth: writeAuth(),
          stageType: 'SNAPSHOT',
          expectedStageVersion: snapshotStageVersion,
          fromStatus: 'IN_PROGRESS',
          toStatus: 'UNKNOWN_OUTCOME',
          lastOutcome: 'UNKNOWN_OUTCOME',
        });
        break;
      }

      for (const field of interpreted.fields) {
        let dimensions: FsdEvidenceDimensionsV1 = field.evidence;
        const accepted = field.evidence.queryAccepted === true;
        dimensions = applyFsd3SnapshotObservationToDimensions(
          dimensions,
          providerResponse.valuesByField?.[field.fieldName],
          accepted,
        );
        if (dimensions.observedValue === true) {
          observedSignalCount += 1;
        }
        const shape = classifyDeclaredFsdSignals([field.fieldName])[0]?.shape ?? 'UNKNOWN';
        await this.persistence.recordSignalEvidence({
          ...writeAuth(),
          stageId: snapshotStage.stageId,
          stageType: 'SNAPSHOT',
          signalName: field.fieldName,
          evidenceState: mapFsd3PlannerEvidenceToPersistenceState(dimensions),
          declaredByProvider: true,
          schemaShape: shape,
          queryPlanned: true,
          queryAccepted: dimensions.queryAccepted ?? null,
          observedValue: dimensions.observedValue ?? null,
          provenanceJson: { documentFingerprint: document.fingerprint },
          qualityJson: buildFsd3EvidenceQualityJson({
            shape,
            observationKind: providerResponse.valuesByField?.[field.fieldName]?.kind,
            dimensions,
          }),
        });
      }

      checkpoint.completedDocumentFingerprints.push(document.fingerprint);
      checkpoint.nextDocumentIndex = index + 1;
      const cp = await this.persistence.advanceStageCheckpoint({
        auth: writeAuth(),
        stageType: 'SNAPSHOT',
        expectedStageVersion: snapshotStageVersion,
        planFingerprint: snapshotPlanFingerprint,
        checkpointJson: checkpoint as unknown as Prisma.InputJsonValue,
      });
      if (cp.applied) {
        snapshotStageVersion = cp.stageVersion;
      }
    }

    if (!unknownOutcome && snapshotPlan.documents.length > 0) {
      await this.persistence.transitionStageStatus({
        auth: writeAuth(),
        stageType: 'SNAPSHOT',
        expectedStageVersion: snapshotStageVersion,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUCCEEDED',
      });
      snapshotStageVersion += 1;
    }

    const runComplete = await this.persistence.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: runVersion,
      fromStatus: 'IN_PROGRESS',
      toStatus: unknownOutcome ? 'FAILED' : 'COMPLETED',
      failureClass: unknownOutcome ? 'UNKNOWN' : undefined,
    });
    if (runComplete.applied) {
      runVersion += 1;
    }

    return {
      status: unknownOutcome ? 'PARTIAL' : 'COMPLETED',
      runId: acquired.runId,
      catalogSignalCount: catalogResult.availableSignals.length,
      snapshotDocumentsExecuted: checkpoint.completedDocumentFingerprints.length,
      observedSignalCount,
      unknownOutcomeStage: unknownOutcome,
    };
  }
}
