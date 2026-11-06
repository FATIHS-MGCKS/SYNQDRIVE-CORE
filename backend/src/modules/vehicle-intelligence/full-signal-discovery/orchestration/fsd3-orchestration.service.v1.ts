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
  buildFsdDimoConnectionIdentityFingerprint,
  FsdDiscoveryPersistenceError,
  type FsdDiscoveryRunIdentityV1,
  type FsdDiscoveryWriteAuthorizationV1,
} from '../persistence/fsd-discovery-persistence.contract.v1';
import type {
  AcquireFsdDiscoveryRunResultV1,
  FsdDiscoveryPersistenceRepository,
} from '../persistence/fsd-discovery-persistence.repository';
import {
  applyFsd3SnapshotObservationToDimensions,
  buildFsd3EvidenceQualityJson,
  mapFsd3CatalogEvidenceState,
  mapFsd3PlannerEvidenceToPersistenceState,
} from './fsd3-evidence.mapper.v1';
import {
  buildFsd3CatalogStagePlanFingerprintForRequestV1,
  buildFsd3DiscoveryRequestRunKeyV1,
  FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1,
} from './fsd3-discovery-request.v1';
import {
  buildFsd3DeclaredCatalogFingerprintV1,
  buildFsd3SnapshotStagePlanFingerprintV1,
} from './fsd3-fingerprint.v1';
import {
  buildSkippedResult,
  buildTerminalFailureResult,
  findStageInBundle,
  readCatalogCheckpointFromBundle,
} from './fsd3-orchestration.helpers.v1';
import {
  assertFsd3VehicleAllowed,
  type Fsd3OrchestrationConfigV1,
} from './fsd3-orchestration.config.v1';
import type { Fsd3DiscoveryProviderPortV1 } from './fsd3-provider.port.v1';
import {
  createEmptyFsd3RequestLedger,
  emptyFsd3SnapshotProgressCheckpoint,
  finalizeFsd3ProviderRequestAttempt,
  FSD3_CATALOG_ATTEMPT_KEY_V1,
  classifyFsd3CatalogReserveForProviderDispatch,
  classifyFsd3ReserveForProviderDispatch,
  findFsd3AttemptByQueryFingerprint,
  findUnsettledSnapshotAttempts,
  hasBlockingCatalogReservation,
  parseFsd3SnapshotStageCheckpoint,
  reserveFsd3ProviderRequestAttempt,
  snapshotCheckpointToJson,
  type Fsd3CatalogStageCheckpointV1,
  type Fsd3ProviderRequestAttemptOutcomeV1,
  type Fsd3SnapshotProgressCheckpointV1,
} from './fsd3-request-ledger.v1';

export type Fsd3OrchestrationRunResultV1 =
  | { status: 'SKIPPED'; reason: string }
  | {
      status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      runId: string;
      catalogSignalCount: number;
      snapshotDocumentsExecuted: number;
      observedSignalCount: number;
      unknownOutcomeStage: boolean;
      failureReason?: string;
    };

export type Fsd3OrchestrationTestHooksV1 = {
  afterCatalogRequestSlotReserved?: () => void | Promise<void>;
  afterSnapshotDocumentCompleted?: (documentIndex: number) => void | Promise<void>;
  afterSnapshotRequestSlotReserved?: (documentIndex: number) => void | Promise<void>;
  afterSnapshotProviderResponse?: (documentIndex: number) => void | Promise<void>;
};

export type Fsd3OrchestrationInputV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoVehicleId: string;
  dimoTokenId: number;
  discoveryRequestKey: string;
  leaseOwner: string;
  leaseExpiresAt: Date;
  budget?: FsdBudgetConfigV1;
};

const CATALOG_QUERY_FINGERPRINT_V1 = 'catalog:availableSignals:v1';

export class Fsd3CatalogSnapshotOrchestratorService {
  constructor(
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly provider: Fsd3DiscoveryProviderPortV1,
    private readonly config: Fsd3OrchestrationConfigV1,
    private readonly testHooks?: Fsd3OrchestrationTestHooksV1,
  ) {}

  async runCatalogSnapshotDiscovery(
    input: Fsd3OrchestrationInputV1,
  ): Promise<Fsd3OrchestrationRunResultV1> {
    try {
      assertFsd3VehicleAllowed(this.config, input.vehicleId);
    } catch (err) {
      return buildSkippedResult((err as Error).message);
    }

    const budget = normalizeFsdBudgetConfigV1(input.budget ?? createDefaultFsdBudgetConfigV1());
    if (budget.maxRequestsPerRun <= 0) {
      return buildSkippedResult('FSD3_REQUEST_BUDGET_ZERO');
    }

    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
    };

    try {
      await this.persistence.assertActiveSourceLinkForDispatch(scope);
    } catch (err) {
      if (err instanceof FsdDiscoveryPersistenceError && err.code === 'SOURCE_LINK_INVALID') {
        throw err;
      }
      return buildSkippedResult((err as Error).message);
    }

    const connectionIdentityFingerprint = buildFsdDimoConnectionIdentityFingerprint({
      dimoVehicleId: input.dimoVehicleId,
      tokenId: input.dimoTokenId,
    });
    const runKey = buildFsd3DiscoveryRequestRunKeyV1({
      discoveryRequestKey: input.discoveryRequestKey,
      connectionIdentityFingerprint,
    });

    const identity: FsdDiscoveryRunIdentityV1 = {
      ...scope,
      runKey,
      dimoTokenId: input.dimoTokenId,
      connectionIdentityFingerprint,
    };

    const acquired = await this.persistence.acquireRunWithIdempotency(identity);
    try {
      if (acquired.kind === 'REPLAYED') {
        return await this.continueOrReportExistingRun(input, scope, acquired, budget);
      }
      return await this.executeFreshDiscovery(
        input,
        scope,
        acquired,
        budget,
        connectionIdentityFingerprint,
      );
    } catch (err) {
      if (err instanceof FsdDiscoveryPersistenceError && err.code === 'LEASE_LOST') {
        const runId = acquired.kind === 'REPLAYED' ? acquired.runId : acquired.runId;
        return buildTerminalFailureResult({ runId, reason: 'LEASE_LOST' });
      }
      throw err;
    }
  }

  private assertProviderDispatchAllowed(): void {
    if (this.provider.providerKind === 'live' && !this.config.providerExecutionEnabled) {
      throw new FsdDiscoveryPersistenceError(
        'PROVIDER_DISPATCH_BLOCKED',
        'Live provider dispatch blocked while providerExecutionEnabled is false',
      );
    }
  }

  private async continueOrReportExistingRun(
    input: Fsd3OrchestrationInputV1,
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    acquired: Extract<AcquireFsdDiscoveryRunResultV1, { kind: 'REPLAYED' }>,
    budget: FsdBudgetConfigV1,
  ): Promise<Fsd3OrchestrationRunResultV1> {
    const bundle = await this.persistence.loadRunOrchestrationBundle({
      scope,
      runId: acquired.runId,
    });
    if (!bundle) {
      return buildTerminalFailureResult({ runId: acquired.runId, reason: 'RUN_NOT_FOUND' });
    }

    if (bundle.run.status === 'COMPLETED') {
      return this.derivePersistedRunResult(scope, acquired.runId);
    }
    if (bundle.run.status === 'FAILED' || bundle.run.status === 'INVALIDATED') {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: `RUN_${bundle.run.status}`,
      });
    }

    const snapshotStage = findStageInBundle(bundle, 'SNAPSHOT');
    if (snapshotStage?.status === 'UNKNOWN_OUTCOME') {
      return this.derivePersistedRunResult(scope, acquired.runId);
    }

    const catalogCp = readCatalogCheckpointFromBundle(bundle);
    if (catalogCp && hasBlockingCatalogReservation(catalogCp)) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_NOT_SAFE_CATALOG_ATTEMPT_UNSETTLED',
      });
    }

    const claimed = await this.persistence.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
    });
    if (!claimed) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'LEASE_NOT_AVAILABLE_FOR_RESUME',
      });
    }

    const runVersionRef = { value: acquired.version + 1 };
    const writeAuth = (): FsdDiscoveryWriteAuthorizationV1 => ({
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: runVersionRef.value,
      leaseOwner: input.leaseOwner,
    });

    const catalogStage = findStageInBundle(bundle, 'CATALOG');
    if (!catalogStage || catalogStage.status !== 'SUCCEEDED') {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_NOT_SAFE_CATALOG_INCOMPLETE',
      });
    }

    const catalogStageVersionRef = { value: catalogStage.version };

    const catalogCheckpoint = readCatalogCheckpointFromBundle(bundle);
    const catalogSignals = catalogCheckpoint?.catalogFetch?.availableSignalNames;
    const catalogFingerprint = catalogCheckpoint?.catalogFetch?.declaredCatalogFingerprint;
    if (!catalogSignals?.length || !catalogFingerprint) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_MISSING_CATALOG_EVIDENCE',
      });
    }

    const resumeProgress = parseFsd3SnapshotStageCheckpoint(
      findStageInBundle(bundle, 'SNAPSHOT')?.checkpointJson,
    );
    if (catalogCheckpoint) {
      const unsettled = findUnsettledSnapshotAttempts(
        catalogCheckpoint.requestLedger,
        resumeProgress,
      );
      if (unsettled.length > 0) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'RESUME_NOT_SAFE_SNAPSHOT_ATTEMPT_UNSETTLED',
        });
      }
    }

    return this.executeSnapshotPhase({
      input,
      scope,
      runId: acquired.runId,
      writeAuth,
      runVersionRef,
      budget,
      catalogFingerprint,
      catalogSignals,
      catalogStageId: catalogStage.id,
      catalogStageVersionRef,
      resumeSnapshotProgress: resumeProgress,
      existingSnapshotStage: findStageInBundle(bundle, 'SNAPSHOT'),
    });
  }

  private async executeFreshDiscovery(
    input: Fsd3OrchestrationInputV1,
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    acquired: Extract<AcquireFsdDiscoveryRunResultV1, { kind: 'CREATED' }>,
    budget: FsdBudgetConfigV1,
    connectionIdentityFingerprint: string,
  ): Promise<Fsd3OrchestrationRunResultV1> {
    const claimed = await this.persistence.claimRunLease({
      scope,
      runId: acquired.runId,
      expectedVersion: acquired.version,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
    });
    if (!claimed) {
      return buildTerminalFailureResult({ runId: acquired.runId, reason: 'LEASE_CLAIM_FAILED' });
    }

    const runVersionRef = { value: acquired.version + 1 };
    const writeAuth = (): FsdDiscoveryWriteAuthorizationV1 => ({
      ...scope,
      runId: acquired.runId,
      expectedRunVersion: runVersionRef.value,
      leaseOwner: input.leaseOwner,
    });

    const toInProgress = await this.persistence.transitionRunStatus({
      scope,
      runId: acquired.runId,
      expectedVersion: runVersionRef.value,
      fromStatus: 'PENDING',
      toStatus: 'IN_PROGRESS',
    });
    if (toInProgress.applied) {
      runVersionRef.value += 1;
    }

    const catalogPlanFingerprint = buildFsd3CatalogStagePlanFingerprintForRequestV1(
      input.discoveryRequestKey,
    );
    const initialCatalogCheckpoint: Fsd3CatalogStageCheckpointV1 = {
      requestLedger: createEmptyFsd3RequestLedger(budget.maxRequestsPerRun),
    };

    const catalogStage = await this.persistence.upsertStagePlan({
      auth: writeAuth(),
      stageType: 'CATALOG',
      planFingerprint: catalogPlanFingerprint,
    });

    let catalogStageVersion = 1;
    const catalogStageVersionRef = { value: catalogStageVersion };
    const catalogStart = await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'CATALOG',
      expectedStageVersion: catalogStageVersionRef.value,
      fromStatus: 'PLANNED',
      toStatus: 'IN_PROGRESS',
      incrementAttempt: true,
      checkpointJson: initialCatalogCheckpoint as unknown as Prisma.InputJsonValue,
    });
    if (catalogStart.applied) {
      catalogStageVersionRef.value += 1;
    }

    let catalogReserveResult: ReturnType<typeof reserveFsd3ProviderRequestAttempt> | null = null;
    const reserve = await this.mutateCatalogLedgerCas({
      writeAuth,
      catalogStageVersionRef,
      planFingerprint: catalogPlanFingerprint,
      budgetTotal: budget.maxRequestsPerRun,
      mutate: (cp) => {
        const result = reserveFsd3ProviderRequestAttempt({
          ledger: cp.requestLedger,
          attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
          queryFingerprint: CATALOG_QUERY_FINGERPRINT_V1,
        });
        catalogReserveResult = result;
        if (result.kind === 'BUDGET_EXHAUSTED') {
          throw new FsdDiscoveryPersistenceError('BUDGET_EXHAUSTED', 'Catalog request budget exhausted');
        }
        if (result.kind === 'IDEMPOTENT') {
          return cp;
        }
        return { ...cp, requestLedger: result.ledger };
      },
    });
    if (!reserve.applied || !reserve.checkpoint || !catalogReserveResult) {
      await this.failRun(scope, acquired.runId, runVersionRef, writeAuth, 'CATALOG_STAGE_CAS_FAILED');
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'CATALOG_STAGE_CAS_FAILED',
      });
    }

    const catalogDispatchGate = classifyFsd3CatalogReserveForProviderDispatch({
      reserve: catalogReserveResult,
      checkpoint: reserve.checkpoint,
    });
    if (catalogDispatchGate.action === 'FAIL_CLOSED') {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: catalogDispatchGate.reason,
      });
    }

    let catalogSignals: string[] = [];
    let catalogFingerprint = '';

    if (catalogDispatchGate.action === 'SKIP_SETTLED') {
      if (
        reserve.checkpoint.catalogFetch?.succeeded !== true ||
        !reserve.checkpoint.catalogFetch.availableSignalNames?.length
      ) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'CATALOG_SKIP_WITHOUT_PERSISTED_FETCH',
        });
      }
      catalogSignals = [...reserve.checkpoint.catalogFetch.availableSignalNames];
      catalogFingerprint = reserve.checkpoint.catalogFetch.declaredCatalogFingerprint ?? '';
    } else {
      await this.testHooks?.afterCatalogRequestSlotReserved?.();
      this.assertProviderDispatchAllowed();
      try {
        const catalogResult = await this.provider.fetchAvailableSignals({
          tokenId: input.dimoTokenId,
        });
        if (catalogResult.httpStatus !== 200 || !Array.isArray(catalogResult.availableSignals)) {
          const fin = await this.finalizeCatalogAttempt(
            writeAuth,
            catalogPlanFingerprint,
            catalogStageVersionRef,
            budget.maxRequestsPerRun,
            'FAILED',
            catalogResult.httpStatus,
          );
          if (!fin) {
            return buildTerminalFailureResult({
              runId: acquired.runId,
              reason: 'CATALOG_LEDGER_FINALIZE_CAS_FAILED',
            });
          }
          await this.failCatalogAndRun(
            scope,
            acquired.runId,
            runVersionRef,
            writeAuth,
            catalogStageVersionRef.value,
          );
          return buildTerminalFailureResult({
            runId: acquired.runId,
            reason: 'CATALOG_PROVIDER_HTTP_INVALID',
          });
        }

        catalogSignals = [...catalogResult.availableSignals];
        catalogFingerprint = buildFsd3DeclaredCatalogFingerprintV1(catalogSignals);

        const finOk = await this.finalizeCatalogAttempt(
          writeAuth,
          catalogPlanFingerprint,
          catalogStageVersionRef,
          budget.maxRequestsPerRun,
          'SUCCEEDED',
          catalogResult.httpStatus,
        );
        if (!finOk) {
          return buildTerminalFailureResult({
            runId: acquired.runId,
            reason: 'CATALOG_LEDGER_FINALIZE_CAS_FAILED',
          });
        }

        const successCp = await this.mutateCatalogLedgerCas({
          writeAuth,
          catalogStageVersionRef,
          planFingerprint: catalogPlanFingerprint,
          budgetTotal: budget.maxRequestsPerRun,
          mutate: (cp) => ({
            ...cp,
            catalogFetch: {
              succeeded: true,
              declaredCatalogFingerprint: catalogFingerprint,
              availableSignalNames: catalogSignals,
              httpStatus: catalogResult.httpStatus,
            },
          }),
        });
        if (!successCp.applied) {
          return buildTerminalFailureResult({
            runId: acquired.runId,
            reason: 'CATALOG_FETCH_PERSIST_CAS_FAILED',
          });
        }
      } catch (err) {
        if (err instanceof FsdDiscoveryPersistenceError && err.code === 'PROVIDER_DISPATCH_BLOCKED') {
          throw err;
        }
        if (err instanceof FsdDiscoveryPersistenceError && err.code === 'LEASE_LOST') {
          return buildTerminalFailureResult({
            runId: acquired.runId,
            reason: 'LEASE_LOST',
          });
        }
        try {
          await this.finalizeCatalogAttemptUnknown(
            writeAuth,
            catalogPlanFingerprint,
            catalogStageVersionRef,
            budget.maxRequestsPerRun,
          );
        } catch {
          // Best-effort ledger finalize when fence is already lost.
        }
        await this.failCatalogAndRun(
          scope,
          acquired.runId,
          runVersionRef,
          writeAuth,
          catalogStageVersionRef.value,
        );
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: err instanceof Error ? err.message : 'CATALOG_PROVIDER_FAILED',
        });
      }
    }

    const classified = classifyDeclaredFsdSignals(catalogSignals);
    const catalogSet = new Set(catalogSignals);
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

    await this.persistence.recordSignalEvidence({
      ...writeAuth(),
      stageId: catalogStage.stageId,
      stageType: 'CATALOG',
      signalName: FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1,
      evidenceState: 'OBSERVED',
      declaredByProvider: false,
      schemaShape: null,
      queryPlanned: false,
      provenanceJson: { declaredCatalogFingerprint: catalogFingerprint },
      qualityJson: { declaredCatalogFingerprint: catalogFingerprint },
    });

    const catalogDone = await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'CATALOG',
      expectedStageVersion: catalogStageVersionRef.value,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'SUCCEEDED',
    });
    if (!catalogDone.applied) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'CATALOG_STAGE_COMPLETE_CAS_FAILED',
      });
    }
    catalogStageVersionRef.value += 1;

    return this.executeSnapshotPhase({
      input,
      scope,
      runId: acquired.runId,
      writeAuth,
      runVersionRef,
      budget,
      catalogFingerprint,
      catalogSignals,
      catalogStageId: catalogStage.stageId,
      catalogStageVersionRef,
      resumeSnapshotProgress: emptyFsd3SnapshotProgressCheckpoint(),
      existingSnapshotStage: null,
    });
  }

  private async executeSnapshotPhase(input: {
    input: Fsd3OrchestrationInputV1;
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string };
    runId: string;
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    runVersionRef: { value: number };
    budget: FsdBudgetConfigV1;
    catalogFingerprint: string;
    catalogSignals: readonly string[];
    catalogStageId: string;
    catalogStageVersionRef: { value: number };
    resumeSnapshotProgress: Fsd3SnapshotProgressCheckpointV1;
    existingSnapshotStage: ReturnType<typeof findStageInBundle>;
  }): Promise<Fsd3OrchestrationRunResultV1> {
    const remainingDocs = resolveMaxSnapshotDocumentsFromRemainingBudget(
      input.budget.maxRequestsPerRun - FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
    );
    const snapshotPlan = planFsdSnapshotQueries({
      tokenId: input.input.dimoTokenId,
      declaredFieldNames: input.catalogSignals,
      budget: input.budget,
      maxSnapshotDocuments: remainingDocs,
    });

    const snapshotPlanFingerprint = buildFsd3SnapshotStagePlanFingerprintV1({
      catalogFingerprint: input.catalogFingerprint,
      documentFingerprints: snapshotPlan.documents.map((d) => d.fingerprint),
    });

    let snapshotStageId: string;
    let snapshotStageVersion: number;
    const checkpoint = { ...input.resumeSnapshotProgress };

    if (input.existingSnapshotStage) {
      snapshotStageId = input.existingSnapshotStage.id;
      snapshotStageVersion = input.existingSnapshotStage.version;
      if (input.existingSnapshotStage.planFingerprint !== snapshotPlanFingerprint) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'RESUME_SNAPSHOT_PLAN_MISMATCH',
        });
      }
      if (
        input.existingSnapshotStage.status === 'SUCCEEDED' ||
        input.existingSnapshotStage.status === 'SKIPPED'
      ) {
        return this.finalizeRunAndBuildResult({
          scope: input.scope,
          runId: input.runId,
          runVersionRef: input.runVersionRef,
          writeAuth: input.writeAuth,
          checkpoint,
          catalogSignalCount: input.catalogSignals.length,
          unknownOutcome: false,
          hasRejections: checkpoint.rejectedQueryFingerprints.length > 0,
          hasDeferred: snapshotPlan.deferredSignals.length > 0,
          snapshotTerminal: input.existingSnapshotStage.status,
        });
      }
    } else {
      const snapshotStage = await this.persistence.upsertStagePlan({
        auth: input.writeAuth(),
        stageType: 'SNAPSHOT',
        planFingerprint: snapshotPlanFingerprint,
      });
      snapshotStageId = snapshotStage.stageId;
      snapshotStageVersion = 1;

      for (const deferred of snapshotPlan.deferredSignals) {
        await this.persistence.recordSignalEvidence({
          ...input.writeAuth(),
          stageId: snapshotStageId,
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

      if (snapshotPlan.documents.length === 0) {
        const skipped = await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
          stageType: 'SNAPSHOT',
          expectedStageVersion: snapshotStageVersion,
          fromStatus: 'PLANNED',
          toStatus: 'SKIPPED',
          checkpointJson: snapshotCheckpointToJson(checkpoint),
        });
        if (!skipped.applied) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'SNAPSHOT_SKIP_CAS_FAILED',
          });
        }
        return this.finalizeRunAndBuildResult({
          scope: input.scope,
          runId: input.runId,
          runVersionRef: input.runVersionRef,
          writeAuth: input.writeAuth,
          checkpoint,
          catalogSignalCount: input.catalogSignals.length,
          unknownOutcome: false,
          hasRejections: false,
          hasDeferred: snapshotPlan.deferredSignals.length > 0,
          snapshotTerminal: 'SKIPPED',
        });
      }

      const snapStart = await this.persistence.transitionStageStatus({
        auth: input.writeAuth(),
        stageType: 'SNAPSHOT',
        expectedStageVersion: snapshotStageVersion,
        fromStatus: 'PLANNED',
        toStatus: 'IN_PROGRESS',
        incrementAttempt: true,
        checkpointJson: snapshotCheckpointToJson(checkpoint),
      });
      if (snapStart.applied) {
        snapshotStageVersion += 1;
      }
    }

    if (input.existingSnapshotStage && input.existingSnapshotStage.status === 'IN_PROGRESS') {
      snapshotStageId = input.existingSnapshotStage.id;
      snapshotStageVersion = input.existingSnapshotStage.version;
    }

    let observedSignalCount = (
      await this.persistence.summarizeRunEvidenceForOrchestration(input.runId)
    ).observedSignalCount;
    let unknownOutcome = false;

    for (let index = checkpoint.nextDocumentIndex; index < snapshotPlan.documents.length; index++) {
      const document = snapshotPlan.documents[index];
      if (checkpoint.rejectedQueryFingerprints.includes(document.fingerprint)) {
        checkpoint.nextDocumentIndex = index + 1;
        continue;
      }
      if (checkpoint.completedDocumentFingerprints.includes(document.fingerprint)) {
        continue;
      }

      const catalogPlanFingerprint = buildFsd3CatalogStagePlanFingerprintForRequestV1(
        input.input.discoveryRequestKey,
      );
      let snapshotReserveResult: ReturnType<typeof reserveFsd3ProviderRequestAttempt> | null = null;
      const reserveSnap = await this.mutateCatalogLedgerCas({
        writeAuth: input.writeAuth,
        catalogStageVersionRef: input.catalogStageVersionRef,
        planFingerprint: catalogPlanFingerprint,
        budgetTotal: input.budget.maxRequestsPerRun,
        mutate: (cp) => {
          const result = reserveFsd3ProviderRequestAttempt({
            ledger: cp.requestLedger,
            attemptKey: `snapshot:${document.fingerprint}`,
            queryFingerprint: document.fingerprint,
          });
          snapshotReserveResult = result;
          if (result.kind === 'BUDGET_EXHAUSTED') {
            throw new FsdDiscoveryPersistenceError('BUDGET_EXHAUSTED', 'Snapshot budget exhausted');
          }
          if (result.kind === 'IDEMPOTENT') {
            return cp;
          }
          return { ...cp, requestLedger: result.ledger };
        },
      });
      if (!reserveSnap.applied || !snapshotReserveResult) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'SNAPSHOT_LEDGER_CAS_FAILED',
        });
      }

      const snapshotDispatchGate = classifyFsd3ReserveForProviderDispatch({
        reserve: snapshotReserveResult,
        checkpoint,
        queryFingerprint: document.fingerprint,
      });
      if (snapshotDispatchGate.action === 'FAIL_CLOSED') {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: snapshotDispatchGate.reason,
        });
      }
      if (snapshotDispatchGate.action === 'SKIP_SETTLED') {
        if (!checkpoint.completedDocumentFingerprints.includes(document.fingerprint)) {
          checkpoint.nextDocumentIndex = Math.max(checkpoint.nextDocumentIndex, index + 1);
        }
        continue;
      }

      await this.testHooks?.afterSnapshotRequestSlotReserved?.(index);
      this.assertProviderDispatchAllowed();

      let providerResponse;
      try {
        providerResponse = await this.provider.executeSnapshotDocument({
          tokenId: input.input.dimoTokenId,
          queryText: document.queryText,
          documentFingerprint: document.fingerprint,
          fieldNamesInDocument: document.fieldNames,
        });
        await this.testHooks?.afterSnapshotProviderResponse?.(index);
      } catch (err) {
        if (err instanceof FsdDiscoveryPersistenceError && err.code === 'PROVIDER_DISPATCH_BLOCKED') {
          throw err;
        }
        const unknownFin = await this.finalizeSnapshotLedgerAttempt(
          input.writeAuth,
          catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          document.fingerprint,
          'UNKNOWN',
        );
        if (!unknownFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'SNAPSHOT_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: err instanceof Error ? err.message : 'SNAPSHOT_PROVIDER_FAILED',
        });
      }

      if (
        providerResponse.documentFingerprint !== document.fingerprint ||
        providerResponse.fieldNamesInDocument.join('|') !== document.fieldNames.join('|')
      ) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'SNAPSHOT_RESPONSE_FINGERPRINT_MISMATCH',
        });
      }

      const interpreted = interpretFsdGraphqlProviderResponse({
        fieldNamesInDocument: document.fieldNames,
        dataPresent: providerResponse.dataPresent,
        httpStatus: providerResponse.httpStatus,
        errors: providerResponse.errors,
      });

      if (providerResponse.httpStatus === 422 || providerResponse.httpStatus === 400) {
        if (!checkpoint.rejectedQueryFingerprints.includes(document.fingerprint)) {
          checkpoint.rejectedQueryFingerprints.push(document.fingerprint);
        }
        await this.persistence.recordSignalEvidence({
          ...input.writeAuth(),
          stageId: snapshotStageId,
          stageType: 'SNAPSHOT',
          signalName: `__fsd3_rejected_document__:${document.fingerprint}`,
          evidenceState: 'QUERY_FAILED',
          declaredByProvider: false,
          schemaShape: null,
          queryPlanned: true,
          queryAccepted: false,
          provenanceJson: {
            documentFingerprint: document.fingerprint,
            httpStatus: providerResponse.httpStatus,
          },
          qualityJson: { terminalReject: true, httpStatus: providerResponse.httpStatus },
        });
        const rejectFin = await this.finalizeSnapshotLedgerAttempt(
          input.writeAuth,
          catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          document.fingerprint,
          'FAILED',
          providerResponse.httpStatus,
        );
        if (!rejectFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'SNAPSHOT_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        checkpoint.nextDocumentIndex = index + 1;
        const cp = await this.persistence.advanceStageCheckpoint({
          auth: input.writeAuth(),
          stageType: 'SNAPSHOT',
          expectedStageVersion: snapshotStageVersion,
          planFingerprint: snapshotPlanFingerprint,
          checkpointJson: snapshotCheckpointToJson(checkpoint),
        });
        if (!cp.applied) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'SNAPSHOT_CHECKPOINT_CAS_FAILED',
          });
        }
        snapshotStageVersion = cp.stageVersion;
        continue;
      }

      if (interpreted.fields.some((f) => f.attribution === 'AMBIGUOUS')) {
        unknownOutcome = true;
        const ambFin = await this.finalizeSnapshotLedgerAttempt(
          input.writeAuth,
          catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          document.fingerprint,
          'UNKNOWN',
        );
        if (!ambFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'SNAPSHOT_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
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
          ...input.writeAuth(),
          stageId: snapshotStageId,
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

      const successFin = await this.finalizeSnapshotLedgerAttempt(
        input.writeAuth,
        catalogPlanFingerprint,
        input.catalogStageVersionRef,
        input.budget.maxRequestsPerRun,
        document.fingerprint,
        'SUCCEEDED',
        providerResponse.httpStatus,
      );
      if (!successFin) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'SNAPSHOT_LEDGER_FINALIZE_CAS_FAILED',
        });
      }

      checkpoint.completedDocumentFingerprints.push(document.fingerprint);
      checkpoint.nextDocumentIndex = index + 1;
      const cp = await this.persistence.advanceStageCheckpoint({
        auth: input.writeAuth(),
        stageType: 'SNAPSHOT',
        expectedStageVersion: snapshotStageVersion,
        planFingerprint: snapshotPlanFingerprint,
        checkpointJson: snapshotCheckpointToJson(checkpoint),
      });
      if (!cp.applied) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'SNAPSHOT_CHECKPOINT_CAS_FAILED',
        });
      }
      snapshotStageVersion = cp.stageVersion;
      await this.testHooks?.afterSnapshotDocumentCompleted?.(index);
    }

    if (!unknownOutcome) {
      const snapDone = await this.persistence.transitionStageStatus({
        auth: input.writeAuth(),
        stageType: 'SNAPSHOT',
        expectedStageVersion: snapshotStageVersion,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUCCEEDED',
      });
      if (!snapDone.applied) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'SNAPSHOT_COMPLETE_CAS_FAILED',
        });
      }
    }

    return this.finalizeRunAndBuildResult({
      scope: input.scope,
      runId: input.runId,
      runVersionRef: input.runVersionRef,
      writeAuth: input.writeAuth,
      checkpoint,
      catalogSignalCount: input.catalogSignals.length,
      unknownOutcome,
      hasRejections: checkpoint.rejectedQueryFingerprints.length > 0,
      hasDeferred: snapshotPlan.deferredSignals.length > 0,
      snapshotTerminal: unknownOutcome ? 'UNKNOWN_OUTCOME' : 'SUCCEEDED',
      observedSignalCount,
    });
  }

  private async finalizeRunAndBuildResult(input: {
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string };
    runId: string;
    runVersionRef: { value: number };
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    checkpoint: Fsd3SnapshotProgressCheckpointV1;
    catalogSignalCount: number;
    unknownOutcome: boolean;
    hasRejections: boolean;
    hasDeferred: boolean;
    snapshotTerminal: string;
    observedSignalCount?: number;
  }): Promise<Fsd3OrchestrationRunResultV1> {
    const allSucceeded =
      !input.unknownOutcome &&
      (input.snapshotTerminal === 'SUCCEEDED' || input.snapshotTerminal === 'SKIPPED') &&
      !input.hasRejections &&
      !input.hasDeferred;
    const runTarget = input.unknownOutcome
      ? 'FAILED'
      : input.snapshotTerminal === 'SUCCEEDED' || input.snapshotTerminal === 'SKIPPED'
        ? 'COMPLETED'
        : 'FAILED';
    const clientStatus = input.unknownOutcome
      ? 'PARTIAL'
      : allSucceeded
        ? 'COMPLETED'
        : 'PARTIAL';

    const applied = await this.persistence.transitionRunStatus({
      scope: input.scope,
      runId: input.runId,
      expectedVersion: input.runVersionRef.value,
      fromStatus: 'IN_PROGRESS',
      toStatus: runTarget,
      failureClass: input.unknownOutcome ? 'UNKNOWN' : input.hasRejections ? 'UNKNOWN' : undefined,
    });
    if (!applied.applied) {
      return buildTerminalFailureResult({
        runId: input.runId,
        reason: 'RUN_COMPLETE_CAS_FAILED',
      });
    }

    if (clientStatus === 'COMPLETED') {
      const bundle = await this.persistence.loadRunOrchestrationBundle({
        scope: input.scope,
        runId: input.runId,
      });
      const catalog = findStageInBundle(bundle!, 'CATALOG');
      const snapshot = findStageInBundle(bundle!, 'SNAPSHOT');
      if (catalog?.status !== 'SUCCEEDED') {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'RUN_COMPLETE_INCONSISTENT_CATALOG',
        });
      }
      if (
        snapshot &&
        snapshot.status !== 'SUCCEEDED' &&
        snapshot.status !== 'SKIPPED'
      ) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'RUN_COMPLETE_INCONSISTENT_SNAPSHOT',
        });
      }
    }

    return {
      status: clientStatus,
      runId: input.runId,
      catalogSignalCount: input.catalogSignalCount,
      snapshotDocumentsExecuted: input.checkpoint.completedDocumentFingerprints.length,
      observedSignalCount: input.observedSignalCount ?? 0,
      unknownOutcomeStage: input.unknownOutcome,
    };
  }

  private async derivePersistedRunResult(
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    runId: string,
  ): Promise<Fsd3OrchestrationRunResultV1> {
    const bundle = await this.persistence.loadRunOrchestrationBundle({ scope, runId });
    if (!bundle) {
      return buildTerminalFailureResult({ runId, reason: 'RUN_NOT_FOUND' });
    }
    if (bundle.run.status === 'FAILED' || bundle.run.status === 'INVALIDATED') {
      return buildTerminalFailureResult({
        runId,
        reason: `RUN_${bundle.run.status}`,
      });
    }
    if (bundle.run.status !== 'COMPLETED') {
      return buildTerminalFailureResult({ runId, reason: 'RUN_NOT_TERMINAL' });
    }

    const summary = await this.persistence.summarizeRunEvidenceForOrchestration(runId);
    const snapshotStage = findStageInBundle(bundle, 'SNAPSHOT');
    const progress = parseFsd3SnapshotStageCheckpoint(snapshotStage?.checkpointJson);
    const unknownOutcomeStage = snapshotStage?.status === 'UNKNOWN_OUTCOME';
    const hasRejections =
      summary.rejectedDocumentEvidenceCount > 0 || progress.rejectedQueryFingerprints.length > 0;
    const hasDeferred = summary.deferredSignalCount > 0;

    let status: 'COMPLETED' | 'PARTIAL';
    if (unknownOutcomeStage || hasRejections || hasDeferred) {
      status = 'PARTIAL';
    } else {
      status = 'COMPLETED';
    }

    return {
      status,
      runId,
      catalogSignalCount: summary.catalogSignalCount,
      snapshotDocumentsExecuted: progress.completedDocumentFingerprints.length,
      observedSignalCount: summary.observedSignalCount,
      unknownOutcomeStage,
      failureReason: unknownOutcomeStage
        ? 'UNKNOWN_OUTCOME'
        : hasRejections
          ? 'QUERY_REJECTED'
          : hasDeferred
            ? 'DEFERRED_SIGNALS'
            : undefined,
    };
  }

  private async mutateCatalogLedgerCas(input: {
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    catalogStageVersionRef: { value: number };
    planFingerprint: string;
    budgetTotal: number;
    mutate: (checkpoint: Fsd3CatalogStageCheckpointV1) => Fsd3CatalogStageCheckpointV1;
  }): Promise<{ applied: boolean; checkpoint: Fsd3CatalogStageCheckpointV1 | null }> {
    const result = await this.persistence.mutateCatalogStageCheckpoint({
      auth: input.writeAuth(),
      expectedStageVersion: input.catalogStageVersionRef.value,
      planFingerprint: input.planFingerprint,
      budgetTotal: input.budgetTotal,
      mutate: input.mutate,
    });
    if (result.applied) {
      input.catalogStageVersionRef.value = result.stageVersion;
    }
    return { applied: result.applied, checkpoint: result.checkpoint };
  }

  private async finalizeCatalogAttempt(
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    planFingerprint: string,
    catalogStageVersionRef: { value: number },
    budgetTotal: number,
    outcome: 'FAILED' | 'SUCCEEDED',
    httpStatus?: number,
  ): Promise<boolean> {
    const fin = await this.mutateCatalogLedgerCas({
      writeAuth,
      catalogStageVersionRef,
      planFingerprint,
      budgetTotal,
      mutate: (cp) => ({
        ...cp,
        requestLedger: finalizeFsd3ProviderRequestAttempt({
          ledger: cp.requestLedger,
          queryFingerprint: CATALOG_QUERY_FINGERPRINT_V1,
          outcome,
          httpStatus,
        }),
      }),
    });
    return fin.applied;
  }

  private async finalizeCatalogAttemptUnknown(
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    planFingerprint: string,
    catalogStageVersionRef: { value: number },
    budgetTotal: number,
  ): Promise<boolean> {
    const fin = await this.mutateCatalogLedgerCas({
      writeAuth,
      catalogStageVersionRef,
      planFingerprint,
      budgetTotal,
      mutate: (cp) => ({
        ...cp,
        requestLedger: finalizeFsd3ProviderRequestAttempt({
          ledger: cp.requestLedger,
          queryFingerprint: CATALOG_QUERY_FINGERPRINT_V1,
          outcome: 'UNKNOWN',
        }),
      }),
    });
    return fin.applied;
  }

  private async finalizeSnapshotLedgerAttempt(
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    planFingerprint: string,
    catalogStageVersionRef: { value: number },
    budgetTotal: number,
    queryFingerprint: string,
    outcome: Exclude<Fsd3ProviderRequestAttemptOutcomeV1, 'RESERVED'>,
    httpStatus?: number,
  ): Promise<boolean> {
    const fin = await this.mutateCatalogLedgerCas({
      writeAuth,
      catalogStageVersionRef,
      planFingerprint,
      budgetTotal,
      mutate: (cp) => ({
        ...cp,
        requestLedger: finalizeFsd3ProviderRequestAttempt({
          ledger: cp.requestLedger,
          queryFingerprint,
          outcome,
          httpStatus,
        }),
      }),
    });
    return fin.applied;
  }

  private async failCatalogAndRun(
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    runId: string,
    runVersionRef: { value: number },
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    catalogStageVersion: number,
  ): Promise<void> {
    await this.persistence.transitionStageStatus({
      auth: writeAuth(),
      stageType: 'CATALOG',
      expectedStageVersion: catalogStageVersion,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'FAILED',
    });
    await this.failRun(scope, runId, runVersionRef, writeAuth, 'CATALOG_FAILED');
  }

  private async failRun(
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    runId: string,
    runVersionRef: { value: number },
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    _reason: string,
  ): Promise<void> {
    await this.persistence.transitionRunStatus({
      scope,
      runId,
      expectedVersion: runVersionRef.value,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'FAILED',
    });
  }
}
