import type { Prisma } from '@prisma/client';
import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  validateHistoricalWindowForPlanning,
  type FsdBudgetConfigV1,
} from '../fsd-budget.contract.v1';
import { computeExpectedBucketPositions } from '../fsd-coverage.calculator.v1';
import { FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 } from '../fsd-discovery.planner.v1';
import type { FsdEvidenceDimensionsV1 } from '../fsd-evidence.contract.v1';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';
import { interpretFsdGraphqlProviderResponse } from '../fsd-response.interpreter.v1';
import { classifyDeclaredFsdSignals } from '../fsd-signal-shape.classifier.v1';
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
  buildFsd3DeclaredCatalogFingerprintV1,
} from './fsd3-fingerprint.v1';
import { buildFsd3EvidenceQualityJson, mapFsd3CatalogEvidenceState, mapFsd3PlannerEvidenceToPersistenceState } from './fsd3-evidence.mapper.v1';
import {
  buildFsd4CatalogStagePlanFingerprintV1,
  buildFsd4HistoricalRequestRunKeyV1,
  buildFsd4HistoricalStagePlanFingerprintV1,
  buildFsd4HistoricalWindowFingerprintV1,
  FSD4_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1,
} from './fsd4-discovery-request.v1';
import {
  buildSkippedResult,
  buildTerminalFailureResult,
  findStageInBundle as findFsd4StageInBundle,
  parseHistoricalProgressFromBundle,
  readCatalogCheckpointFromBundle,
  readHistoricalWindowFromBundle,
} from './fsd4-orchestration.helpers.v1';
import type { Fsd4OrchestrationInputV1, Fsd4OrchestrationRunResultV1 } from './fsd4-orchestration.types.v1';
import { assertFsd4VehicleAllowed, type Fsd4OrchestrationConfigV1 } from './fsd4-orchestration.config.v1';
import { mapHistoricalFieldEvidence } from './fsd4-historical-evidence.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from './fsd4-provider.port.v1';
import { classifyFsd4HistoricalDocumentLedgerOutcomeV1 } from './fsd-provider-outcome.util.v1';
import {
  classifyFsd4CatalogReserveForProviderDispatch,
  classifyFsd4HistoricalReserveForProviderDispatch,
  createEmptyFsd4RequestLedger,
  emptyFsd4HistoricalProgressCheckpoint,
  FSD4_CATALOG_QUERY_FINGERPRINT_V1,
  finalizeFsd4ProviderRequestAttempt,
  findUnsettledHistoricalAttempts,
  hasBlockingFsd4CatalogReservation,
  historicalProgressCheckpointToJson,
  parseFsd4CatalogStageCheckpoint,
  parseHistoricalWindowFromCheckpointJson,
  reserveFsd4ProviderRequestAttempt,
  type Fsd4CatalogStageCheckpointV1,
  type Fsd4HistoricalProgressCheckpointV1,
} from './fsd4-request-ledger.v1';
import { historicalPlanViolatesLocationIsolation, planFsdHistoricalQueries } from '../fsd-historical.planner.v1';
import {
  countConsumedFsd3RequestSlots,
  FSD3_CATALOG_ATTEMPT_KEY_V1,
  type Fsd3ReserveAttemptResultV1,
} from './fsd3-request-ledger.v1';

const CATALOG_QUERY_FP = FSD4_CATALOG_QUERY_FINGERPRINT_V1;

export type { Fsd4OrchestrationInputV1, Fsd4OrchestrationRunResultV1 } from './fsd4-orchestration.types.v1';
export type { Fsd4OrchestrationTestHooksV1 } from './fsd4-orchestration.types.v1';

export class Fsd4HistoricalDiscoveryOrchestratorService {
  constructor(
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly provider: Fsd4HistoricalDiscoveryProviderPortV1,
    private readonly config: Fsd4OrchestrationConfigV1,
    private readonly testHooks?: import('./fsd4-orchestration.types.v1').Fsd4OrchestrationTestHooksV1,
  ) {}

  async runHistoricalDiscovery(input: Fsd4OrchestrationInputV1): Promise<Fsd4OrchestrationRunResultV1> {
    try {
      assertFsd4VehicleAllowed(this.config, input.vehicleId);
    } catch (err) {
      return buildSkippedResult((err as Error).message);
    }

    const budget = normalizeFsdBudgetConfigV1(input.budget ?? createDefaultFsdBudgetConfigV1());
    if (budget.maxRequestsPerRun <= 0) {
      return buildSkippedResult('FSD4_REQUEST_BUDGET_ZERO');
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
    const windowAdmission = validateHistoricalWindowForPlanning(input.historicalWindow, budget);
    if (!windowAdmission.ok) {
      return buildSkippedResult(windowAdmission.reason ?? 'HISTORICAL_WINDOW_INVALID');
    }

    const historicalWindowFingerprint = buildFsd4HistoricalWindowFingerprintV1(input.historicalWindow);
    const runKey = buildFsd4HistoricalRequestRunKeyV1({
      historicalRequestKey: input.historicalRequestKey,
      connectionIdentityFingerprint,
      historicalWindowFingerprint,
    });

    const identity: FsdDiscoveryRunIdentityV1 = {
      ...scope,
      runKey,
      dimoTokenId: input.dimoTokenId,
      connectionIdentityFingerprint,
      discoveryStream: 'FSD4_HISTORICAL',
    };

    let acquired: AcquireFsdDiscoveryRunResultV1;
    try {
      acquired = await this.persistence.acquireHistoricalRunWithIdempotency(identity);
    } catch (err) {
      if (err instanceof FsdDiscoveryPersistenceError && err.code === 'ACTIVE_RUN_CONFLICT') {
        return buildTerminalFailureResult({ reason: 'ACTIVE_RUN_CONFLICT' });
      }
      throw err;
    }

    try {
      if (acquired.kind === 'REPLAYED') {
        return await this.continueOrReportExistingRun(input, scope, acquired, budget);
      }
      return await this.executeFreshRun(input, scope, acquired, budget, {
        historicalWindowFingerprint,
      }, identity);
    } catch (err) {
      if (err instanceof FsdDiscoveryPersistenceError && err.code === 'LEASE_LOST') {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'LEASE_LOST',
        });
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
    input: Fsd4OrchestrationInputV1,
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    acquired: Extract<AcquireFsdDiscoveryRunResultV1, { kind: 'REPLAYED' }>,
    budget: FsdBudgetConfigV1,
  ): Promise<Fsd4OrchestrationRunResultV1> {
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

    const historicalStage = findFsd4StageInBundle(bundle, 'HISTORICAL');
    if (historicalStage?.status === 'UNKNOWN_OUTCOME') {
      return this.derivePersistedRunResult(scope, acquired.runId);
    }

    const catalogCp = readCatalogCheckpointFromBundle(bundle);
    if (catalogCp && hasBlockingFsd4CatalogReservation(catalogCp)) {
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

    const catalogStage = findFsd4StageInBundle(bundle, 'CATALOG');
    if (!catalogStage || catalogStage.status !== 'SUCCEEDED') {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_NOT_SAFE_CATALOG_INCOMPLETE',
      });
    }

    const catalogCheckpoint = readCatalogCheckpointFromBundle(bundle);
    const catalogSignals = catalogCheckpoint?.catalogFetch?.availableSignalNames;
    const catalogFingerprint = catalogCheckpoint?.catalogFetch?.declaredCatalogFingerprint ?? '';
    if (!catalogSignals?.length || !catalogFingerprint) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_MISSING_CATALOG_EVIDENCE',
      });
    }

    const catalogStageVersionRef = { value: catalogStage.version };
    const resumeProgress = parseHistoricalProgressFromBundle(bundle);
    if (catalogCheckpoint) {
      const unsettled = findUnsettledHistoricalAttempts(
        catalogCheckpoint.requestLedger,
        resumeProgress,
      );
      if (unsettled.length > 0) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'RESUME_NOT_SAFE_HISTORICAL_ATTEMPT_UNSETTLED',
        });
      }
    }

    const histCpRaw = findFsd4StageInBundle(bundle, 'HISTORICAL')?.checkpointJson;
    const storedWindow = parseHistoricalWindowFromCheckpointJson(histCpRaw);
    if (storedWindow) {
      if (
        storedWindow.fromUtc !== input.historicalWindow.fromUtc ||
        storedWindow.toUtc !== input.historicalWindow.toUtc
      ) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'RESUME_HISTORICAL_WINDOW_MISMATCH',
        });
      }
    }
    const historicalWindowFingerprint = buildFsd4HistoricalWindowFingerprintV1(input.historicalWindow);
    const consumedCatalog = catalogCheckpoint?.requestLedger
      ? countConsumedFsd3RequestSlots(catalogCheckpoint.requestLedger)
      : FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1;
    const historicalPlan = planFsdHistoricalQueries({
      tokenId: input.dimoTokenId,
      declaredFieldNames: catalogSignals,
      window: input.historicalWindow,
      budget,
      maxPlannedHistoricalRequests: Math.max(0, budget.maxRequestsPerRun - consumedCatalog),
      isolateSpeedSignal: true,
    });

    if (!historicalPlan.budgetValidation.ok) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: historicalPlan.budgetValidation.reason ?? 'HISTORICAL_PLAN_BUDGET_INVALID',
      });
    }

    const historicalPlanFingerprint = buildFsd4HistoricalStagePlanFingerprintV1({
      historicalWindowFingerprint,
      declaredCatalogFingerprint: catalogFingerprint,
      documentFingerprints: historicalPlan.chunks.map((c) => c.documents.fingerprint),
    });

    const existingHistorical = findFsd4StageInBundle(bundle, 'HISTORICAL');
    if (existingHistorical && existingHistorical.planFingerprint !== historicalPlanFingerprint) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'RESUME_HISTORICAL_PLAN_MISMATCH',
      });
    }

    if (historicalPlanViolatesLocationIsolation(historicalPlan)) {
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'HISTORICAL_PLAN_LOCATION_ISOLATION_VIOLATION',
      });
    }

    const resumeConnectionIdentityFingerprint = buildFsdDimoConnectionIdentityFingerprint({
      dimoVehicleId: input.dimoVehicleId,
      tokenId: input.dimoTokenId,
    });
    const dispatchContext: FsdDiscoveryRunIdentityV1 = {
      ...scope,
      runKey: bundle.run.runKey,
      dimoTokenId: input.dimoTokenId,
      connectionIdentityFingerprint: resumeConnectionIdentityFingerprint,
      discoveryStream: 'FSD4_HISTORICAL',
    };

    return this.executeHistoricalPhase({
      input,
      scope,
      runId: acquired.runId,
      writeAuth,
      runVersionRef,
      budget,
      catalogFingerprint,
      catalogSignals,
      catalogPlanFingerprint: buildFsd4CatalogStagePlanFingerprintV1({
        historicalRequestKey: input.historicalRequestKey,
        historicalWindowFingerprint,
      }),
      catalogStageVersionRef,
      historicalPlan,
      historicalPlanFingerprint,
      resumeProgress,
      existingHistoricalStage: existingHistorical,
      dispatchContext,
    });
  }

  private async executeFreshRun(
    input: Fsd4OrchestrationInputV1,
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    acquired: Extract<AcquireFsdDiscoveryRunResultV1, { kind: 'CREATED' }>,
    budget: FsdBudgetConfigV1,
    ctx: { historicalWindowFingerprint: string },
    dispatchContext: FsdDiscoveryRunIdentityV1,
  ): Promise<Fsd4OrchestrationRunResultV1> {
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

    const catalogPlanFingerprint = buildFsd4CatalogStagePlanFingerprintV1({
      historicalRequestKey: input.historicalRequestKey,
      historicalWindowFingerprint: ctx.historicalWindowFingerprint,
    });

    let catalogReuse: { signals: string[]; fingerprint: string } | null = null;
    if (input.verifiedFsd3CatalogRunId) {
      catalogReuse = await this.loadVerifiedFsd3Catalog(input, scope, input.verifiedFsd3CatalogRunId);
      if (!catalogReuse) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'FSD4_VERIFIED_CATALOG_UNAVAILABLE',
        });
      }
    }

    const catalogStage = await this.persistence.upsertStagePlan({
      auth: writeAuth(),
      stageType: 'CATALOG',
      planFingerprint: catalogPlanFingerprint,
    });

    const catalogStageVersionRef = { value: 1 };

    let catalogSignals: string[] = [];
    let catalogFingerprint = '';

    if (catalogReuse) {
      catalogSignals = [...catalogReuse.signals];
      catalogFingerprint = catalogReuse.fingerprint;
      const initialCp: Fsd4CatalogStageCheckpointV1 = {
        requestLedger: createEmptyFsd4RequestLedger(budget.maxRequestsPerRun),
        catalogFetch: {
          succeeded: true,
          declaredCatalogFingerprint: catalogFingerprint,
          availableSignalNames: catalogSignals,
          httpStatus: 200,
        },
      };
      const catStart = await this.persistence.transitionStageStatus({
        auth: writeAuth(),
        stageType: 'CATALOG',
        expectedStageVersion: catalogStageVersionRef.value,
        fromStatus: 'PLANNED',
        toStatus: 'IN_PROGRESS',
        incrementAttempt: true,
        checkpointJson: initialCp as unknown as Prisma.InputJsonValue,
      });
      if (catStart.applied) {
        catalogStageVersionRef.value += 1;
      }
      const reuseReserveSlot: { value: Fsd3ReserveAttemptResultV1 | null } = { value: null };
      const reservedReuse = await this.mutateCatalogLedgerCas({
        writeAuth,
        catalogStageVersionRef,
        planFingerprint: catalogPlanFingerprint,
        budgetTotal: budget.maxRequestsPerRun,
        mutate: (cp) => {
          const result = reserveFsd4ProviderRequestAttempt({
            ledger: cp.requestLedger,
            attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
            queryFingerprint: CATALOG_QUERY_FP,
          });
          reuseReserveSlot.value = result;
          if (result.kind === 'BUDGET_EXHAUSTED') {
            throw new FsdDiscoveryPersistenceError('BUDGET_EXHAUSTED', 'Catalog request budget exhausted');
          }
          if (result.kind === 'IDEMPOTENT') {
            return cp;
          }
          return { ...cp, requestLedger: result.ledger };
        },
      });
      const reuseReserve = reuseReserveSlot.value;
      if (
        !reservedReuse.applied ||
        !reuseReserve ||
        (reuseReserve.kind !== 'RESERVED' && reuseReserve.kind !== 'IDEMPOTENT')
      ) {
        await this.failRun(scope, acquired.runId, runVersionRef, writeAuth);
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'CATALOG_REUSE_LEDGER_RESERVE_FAILED',
        });
      }
      const finReuseLedger = await this.finalizeCatalogAttempt(
        writeAuth,
        catalogPlanFingerprint,
        catalogStageVersionRef,
        budget.maxRequestsPerRun,
        'SUCCEEDED',
        200,
      );
      if (!finReuseLedger) {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'CATALOG_REUSE_LEDGER_FINALIZE_FAILED',
        });
      }
    } else {
      const initialCatalogCheckpoint: Fsd4CatalogStageCheckpointV1 = {
        requestLedger: createEmptyFsd4RequestLedger(budget.maxRequestsPerRun),
      };

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

      let catalogReserveResult: Fsd3ReserveAttemptResultV1 | null = null;
      const reserve = await this.mutateCatalogLedgerCas({
        writeAuth,
        catalogStageVersionRef,
        planFingerprint: catalogPlanFingerprint,
        budgetTotal: budget.maxRequestsPerRun,
        mutate: (cp) => {
          const result = reserveFsd4ProviderRequestAttempt({
            ledger: cp.requestLedger,
            attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
            queryFingerprint: CATALOG_QUERY_FP,
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
        await this.failRun(scope, acquired.runId, runVersionRef, writeAuth);
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: 'CATALOG_STAGE_CAS_FAILED',
        });
      }

      const gate = classifyFsd4CatalogReserveForProviderDispatch({
        reserve: catalogReserveResult,
        checkpoint: reserve.checkpoint,
      });
      if (gate.action === 'FAIL_CLOSED') {
        return buildTerminalFailureResult({
          runId: acquired.runId,
          reason: gate.reason,
        });
      }

      if (gate.action === 'SKIP_SETTLED') {
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
            dispatchContext,
          });
          if (
            catalogResult.httpStatus !== 200 ||
            !Array.isArray(catalogResult.availableSignals) ||
            catalogResult.catalogFetchSucceeded === false
          ) {
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
            return buildTerminalFailureResult({ runId: acquired.runId, reason: 'LEASE_LOST' });
          }
          try {
            await this.finalizeCatalogAttemptUnknown(
              writeAuth,
              catalogPlanFingerprint,
              catalogStageVersionRef,
              budget.maxRequestsPerRun,
            );
          } catch {
            // best-effort
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
      signalName: FSD4_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1,
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

    const bundleMid = await this.persistence.loadRunOrchestrationBundle({
      scope,
      runId: acquired.runId,
    });
    const ledgerAfterCatalog = parseFsd4CatalogStageCheckpoint(
      findFsd4StageInBundle(bundleMid!, 'CATALOG')?.checkpointJson,
    )?.requestLedger;
    const consumed = ledgerAfterCatalog
      ? countConsumedFsd3RequestSlots(ledgerAfterCatalog)
      : FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1;
    const maxHistoricalChunks = Math.max(0, budget.maxRequestsPerRun - consumed);

    const historicalPlan = planFsdHistoricalQueries({
      tokenId: input.dimoTokenId,
      declaredFieldNames: catalogSignals,
      window: input.historicalWindow,
      budget,
      maxPlannedHistoricalRequests: maxHistoricalChunks,
      isolateSpeedSignal: true,
    });

    if (!historicalPlan.budgetValidation.ok) {
      await this.failRun(scope, acquired.runId, runVersionRef, writeAuth);
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: historicalPlan.budgetValidation.reason ?? 'HISTORICAL_PLAN_BUDGET_INVALID',
      });
    }

    if (historicalPlanViolatesLocationIsolation(historicalPlan)) {
      await this.failRun(scope, acquired.runId, runVersionRef, writeAuth);
      return buildTerminalFailureResult({
        runId: acquired.runId,
        reason: 'HISTORICAL_PLAN_LOCATION_ISOLATION_VIOLATION',
      });
    }

    const historicalPlanFingerprint = buildFsd4HistoricalStagePlanFingerprintV1({
      historicalWindowFingerprint: ctx.historicalWindowFingerprint,
      declaredCatalogFingerprint: catalogFingerprint,
      documentFingerprints: historicalPlan.chunks.map((c) => c.documents.fingerprint),
    });

    return this.executeHistoricalPhase({
      input,
      scope,
      runId: acquired.runId,
      writeAuth,
      runVersionRef,
      budget,
      catalogFingerprint,
      catalogSignals,
      catalogPlanFingerprint,
      catalogStageVersionRef,
      historicalPlan,
      historicalPlanFingerprint,
      resumeProgress: emptyFsd4HistoricalProgressCheckpoint(),
      existingHistoricalStage: null,
      dispatchContext,
    });
  }

  private async loadVerifiedFsd3Catalog(
    input: Fsd4OrchestrationInputV1,
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    fsd3RunId: string,
  ): Promise<{ signals: string[]; fingerprint: string } | null> {
    const bundle = await this.persistence.loadRunOrchestrationBundle({
      scope,
      runId: fsd3RunId,
    });
    if (!bundle || bundle.run.status !== 'COMPLETED') {
      return null;
    }
    if (bundle.run.discoveryStream !== 'FSD3_CATALOG_SNAPSHOT') {
      return null;
    }
    const expectedFp = buildFsdDimoConnectionIdentityFingerprint({
      dimoVehicleId: input.dimoVehicleId,
      tokenId: input.dimoTokenId,
    });
    if (
      bundle.run.dimoTokenId !== input.dimoTokenId ||
      bundle.run.connectionIdentityFingerprint !== expectedFp
    ) {
      return null;
    }
    const cat = bundle.stages.find((s) => s.stageType === 'CATALOG');
    if (!cat || cat.status !== 'SUCCEEDED') {
      return null;
    }
    const cp = parseFsd4CatalogStageCheckpoint(cat.checkpointJson);
    if (!cp?.catalogFetch?.succeeded || !cp.catalogFetch.availableSignalNames?.length) {
      return null;
    }
    const persistedNames = await this.persistence.listCatalogSignalNamesForRun(fsd3RunId, cat.id);
    const recomputed = buildFsd3DeclaredCatalogFingerprintV1(persistedNames);
    const storedFingerprint = cp.catalogFetch.declaredCatalogFingerprint ?? '';
    if (recomputed !== storedFingerprint) {
      return null;
    }
    const listFp = buildFsd3DeclaredCatalogFingerprintV1(cp.catalogFetch.availableSignalNames);
    if (listFp !== storedFingerprint) {
      return null;
    }
    if (input.expectedDeclaredCatalogFingerprint && input.expectedDeclaredCatalogFingerprint !== storedFingerprint) {
      return null;
    }
    return { signals: [...cp.catalogFetch.availableSignalNames], fingerprint: storedFingerprint };
  }

  private async executeHistoricalPhase(input: {
    input: Fsd4OrchestrationInputV1;
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string };
    runId: string;
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    runVersionRef: { value: number };
    budget: FsdBudgetConfigV1;
    catalogFingerprint: string;
    catalogSignals: readonly string[];
    catalogPlanFingerprint: string;
    catalogStageVersionRef: { value: number };
    historicalPlan: ReturnType<typeof planFsdHistoricalQueries>;
    historicalPlanFingerprint: string;
    resumeProgress: Fsd4HistoricalProgressCheckpointV1;
    existingHistoricalStage: {
      id: string;
      version: number;
      status: string;
      planFingerprint: string;
    } | null;
    dispatchContext: FsdDiscoveryRunIdentityV1;
  }): Promise<Fsd4OrchestrationRunResultV1> {
    const plan = input.historicalPlan;
    const expectedBuckets = plan.expectedBucketPositions;
    const window = plan.window;
    const histCpPayload = (cp: Fsd4HistoricalProgressCheckpointV1) =>
      historicalProgressCheckpointToJson(cp, window);

    let historicalStageId: string;
    let historicalStageVersion: number;
    const checkpoint = { ...input.resumeProgress };
    let signalsWithCoverage = 0;
    let unknownOutcome = false;
    let chunksExecuted = 0;
    const scope = input.scope;

    if (input.existingHistoricalStage) {
      historicalStageId = input.existingHistoricalStage.id;
      historicalStageVersion = input.existingHistoricalStage.version;
      if (
        input.existingHistoricalStage.status === 'SUCCEEDED' ||
        input.existingHistoricalStage.status === 'SKIPPED'
      ) {
        const summary = await this.persistence.summarizeRunEvidenceForOrchestration(input.runId);
        return this.finalizeHistoricalRun({
          scope: input.scope,
          runId: input.runId,
          writeAuth: input.writeAuth,
          runVersionRef: input.runVersionRef,
          catalogSignalCount: input.catalogSignals.length,
          historicalChunksExecuted: checkpoint.completedDocumentFingerprints.length,
          expectedBucketPositions: expectedBuckets,
          signalsWithHistoricalCoverage: summary.historicalCoverageSignalCount,
          unknownOutcome: false,
          hasDeferred: plan.deferredSignals.length > 0,
          hasRejections: checkpoint.rejectedQueryFingerprints.length > 0,
          historicalTerminal: input.existingHistoricalStage.status,
        });
      }
    } else {
      const histStage = await this.persistence.upsertStagePlan({
        auth: input.writeAuth(),
        stageType: 'HISTORICAL',
        planFingerprint: input.historicalPlanFingerprint,
      });
      historicalStageId = histStage.stageId;
      historicalStageVersion = 1;

      for (const def of plan.deferredSignals) {
        await this.persistence.recordSignalEvidence({
          ...input.writeAuth(),
          stageId: historicalStageId,
          stageType: 'HISTORICAL',
          signalName: def.fieldName,
          evidenceState: 'DEFERRED',
          declaredByProvider: true,
          schemaShape: def.classified.shape,
          queryPlanned: false,
          qualityJson: buildFsd3EvidenceQualityJson({
            shape: def.classified.shape,
            dimensions: def.evidence,
          }),
        });
      }

      if (plan.chunks.length === 0) {
        const skipped = await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
          stageType: 'HISTORICAL',
          expectedStageVersion: historicalStageVersion,
          fromStatus: 'PLANNED',
          toStatus: 'SKIPPED',
          checkpointJson: histCpPayload(checkpoint),
        });
        if (!skipped.applied) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_SKIP_CAS_FAILED',
          });
        }
        return this.finalizeHistoricalRun({
          scope: input.scope,
          runId: input.runId,
          writeAuth: input.writeAuth,
          runVersionRef: input.runVersionRef,
          catalogSignalCount: input.catalogSignals.length,
          historicalChunksExecuted: 0,
          expectedBucketPositions: expectedBuckets,
          signalsWithHistoricalCoverage: 0,
          unknownOutcome: false,
          hasDeferred: plan.deferredSignals.length > 0,
          hasRejections: false,
          historicalTerminal: 'SKIPPED',
        });
      }

      const hStart = await this.persistence.transitionStageStatus({
        auth: input.writeAuth(),
        stageType: 'HISTORICAL',
        expectedStageVersion: historicalStageVersion,
        fromStatus: 'PLANNED',
        toStatus: 'IN_PROGRESS',
        incrementAttempt: true,
        checkpointJson: histCpPayload(checkpoint),
      });
      if (hStart.applied) {
        historicalStageVersion += 1;
      }
    }

    if (input.existingHistoricalStage && input.existingHistoricalStage.status === 'IN_PROGRESS') {
      historicalStageId = input.existingHistoricalStage.id;
      historicalStageVersion = input.existingHistoricalStage.version;
    }

    const coSelectedByChunk = new Map(
      plan.chunks.map((c) => [c.documents.fingerprint, c.fieldNames.length] as const),
    );

    for (let index = checkpoint.nextDocumentIndex; index < plan.chunks.length; index++) {
      const chunk = plan.chunks[index]!;
      const doc = chunk.documents;
      if (checkpoint.rejectedQueryFingerprints.includes(doc.fingerprint)) {
        checkpoint.nextDocumentIndex = index + 1;
        continue;
      }
      if (checkpoint.completedDocumentFingerprints.includes(doc.fingerprint)) {
        continue;
      }

      let histReserve: Fsd3ReserveAttemptResultV1 | null = null;
      const reserveHist = await this.mutateCatalogLedgerCas({
        writeAuth: input.writeAuth,
        catalogStageVersionRef: input.catalogStageVersionRef,
        planFingerprint: input.catalogPlanFingerprint,
        budgetTotal: input.budget.maxRequestsPerRun,
        mutate: (cp) => {
          const result = reserveFsd4ProviderRequestAttempt({
            ledger: cp.requestLedger,
            attemptKey: `historical:${doc.fingerprint}`,
            queryFingerprint: doc.fingerprint,
          });
          histReserve = result;
          if (result.kind === 'BUDGET_EXHAUSTED') {
            throw new FsdDiscoveryPersistenceError('BUDGET_EXHAUSTED', 'Historical budget exhausted');
          }
          if (result.kind === 'IDEMPOTENT') {
            return cp;
          }
          return { ...cp, requestLedger: result.ledger };
        },
      });
      if (!reserveHist.applied || !histReserve) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_LEDGER_CAS_FAILED',
        });
      }

      const dispatchGate = classifyFsd4HistoricalReserveForProviderDispatch({
        reserve: histReserve,
        checkpoint,
        queryFingerprint: doc.fingerprint,
      });
      if (dispatchGate.action === 'FAIL_CLOSED') {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: dispatchGate.reason,
        });
      }
      if (dispatchGate.action === 'SKIP_SETTLED') {
        if (!checkpoint.completedDocumentFingerprints.includes(doc.fingerprint)) {
          checkpoint.nextDocumentIndex = Math.max(checkpoint.nextDocumentIndex, index + 1);
        }
        continue;
      }

      await this.testHooks?.afterHistoricalRequestSlotReserved?.(index);
      this.assertProviderDispatchAllowed();

      let providerResponse;
      try {
        providerResponse = await this.provider.executeHistoricalDocument({
          tokenId: input.input.dimoTokenId,
          queryText: doc.queryText,
          documentFingerprint: doc.fingerprint,
          fieldNamesInDocument: doc.fieldNames,
          dispatchContext: input.dispatchContext,
        });
        await this.testHooks?.afterHistoricalProviderResponse?.(index);
      } catch (err) {
        if (err instanceof FsdDiscoveryPersistenceError && err.code === 'PROVIDER_DISPATCH_BLOCKED') {
          throw err;
        }
        const u = await this.finalizeHistoricalLedgerAttempt(
          input.writeAuth,
          input.catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          doc.fingerprint,
          'UNKNOWN',
        );
        if (!u) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: err instanceof Error ? err.message : 'HISTORICAL_PROVIDER_FAILED',
        });
      }

      if (
        providerResponse.documentFingerprint !== doc.fingerprint ||
        providerResponse.fieldNamesInDocument.join('|') !== doc.fieldNames.join('|')
      ) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_RESPONSE_FINGERPRINT_MISMATCH',
        });
      }

      const interpreted = interpretFsdGraphqlProviderResponse({
        fieldNamesInDocument: doc.fieldNames,
        dataPresent: providerResponse.dataPresent,
        httpStatus: providerResponse.httpStatus,
        errors: providerResponse.errors,
      });

      if (interpreted.fields.some((f) => f.attribution === 'AMBIGUOUS')) {
        unknownOutcome = true;
        const ambFin = await this.finalizeHistoricalLedgerAttempt(
          input.writeAuth,
          input.catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          doc.fingerprint,
          'UNKNOWN',
        );
        if (!ambFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
          stageType: 'HISTORICAL',
          expectedStageVersion: historicalStageVersion,
          fromStatus: 'IN_PROGRESS',
          toStatus: 'UNKNOWN_OUTCOME',
          lastOutcome: 'UNKNOWN_OUTCOME',
        });
        break;
      }

      if (providerResponse.httpStatus === 422 || providerResponse.httpStatus === 400) {
        if (!checkpoint.rejectedQueryFingerprints.includes(doc.fingerprint)) {
          checkpoint.rejectedQueryFingerprints.push(doc.fingerprint);
        }
        await this.persistence.recordSignalEvidence({
          ...input.writeAuth(),
          stageId: historicalStageId,
          stageType: 'HISTORICAL',
          signalName: `__fsd4_rejected_historical__:${doc.fingerprint}`,
          evidenceState: 'QUERY_FAILED',
          declaredByProvider: false,
          schemaShape: null,
          queryPlanned: true,
          queryAccepted: false,
          provenanceJson: { documentFingerprint: doc.fingerprint, httpStatus: providerResponse.httpStatus },
          qualityJson: { terminalReject: true },
        });
        const rejFin = await this.finalizeHistoricalLedgerAttempt(
          input.writeAuth,
          input.catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          doc.fingerprint,
          'FAILED',
          providerResponse.httpStatus,
        );
        if (!rejFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        checkpoint.nextDocumentIndex = index + 1;
        const cpAdv = await this.persistence.advanceStageCheckpoint({
          auth: input.writeAuth(),
          stageType: 'HISTORICAL',
          expectedStageVersion: historicalStageVersion,
          planFingerprint: input.historicalPlanFingerprint,
          checkpointJson: histCpPayload(checkpoint),
        });
        if (!cpAdv.applied) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_CHECKPOINT_CAS_FAILED',
          });
        }
        historicalStageVersion = cpAdv.stageVersion;
        continue;
      }

      const histDispatch = classifyFsd4HistoricalDocumentLedgerOutcomeV1(providerResponse, interpreted);
      if (histDispatch.ledgerOutcome === 'FAILED') {
        const fFin = await this.finalizeHistoricalLedgerAttempt(
          input.writeAuth,
          input.catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          doc.fingerprint,
          'FAILED',
          providerResponse.httpStatus,
        );
        if (!fFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
          stageType: 'HISTORICAL',
          expectedStageVersion: historicalStageVersion,
          fromStatus: 'IN_PROGRESS',
          toStatus: 'FAILED',
          lastOutcome: 'FAILED',
        });
        await this.failRun(scope, input.runId, input.runVersionRef, input.writeAuth);
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_PROVIDER_NON_SUCCESS',
        });
      }
      if (histDispatch.ledgerOutcome === 'UNKNOWN') {
        unknownOutcome = true;
        const uFin = await this.finalizeHistoricalLedgerAttempt(
          input.writeAuth,
          input.catalogPlanFingerprint,
          input.catalogStageVersionRef,
          input.budget.maxRequestsPerRun,
          doc.fingerprint,
          'UNKNOWN',
          providerResponse.httpStatus,
        );
        if (!uFin) {
          return buildTerminalFailureResult({
            runId: input.runId,
            reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
          });
        }
        await this.persistence.transitionStageStatus({
          auth: input.writeAuth(),
          stageType: 'HISTORICAL',
          expectedStageVersion: historicalStageVersion,
          fromStatus: 'IN_PROGRESS',
          toStatus: 'UNKNOWN_OUTCOME',
          lastOutcome: 'UNKNOWN_OUTCOME',
        });
        break;
      }

      const coSelected = coSelectedByChunk.get(doc.fingerprint) ?? doc.fieldNames.length;

      for (const field of interpreted.fields) {
        const observations = providerResponse.observationsByField?.[field.fieldName] ?? [];
        const mapped = mapHistoricalFieldEvidence({
          window,
          fieldName: field.fieldName,
          observations,
          coSelectedFieldCount: coSelected,
          fieldInterpretation: field,
        });

        if (mapped.coverage.validValueBucketCount > 0) {
          signalsWithCoverage += 1;
        }

        const shape = classifyDeclaredFsdSignals([field.fieldName])[0]?.shape ?? 'UNKNOWN';
        const interpFailed = field.evidence.queryFailed === true;
        const dimensions: FsdEvidenceDimensionsV1 = {
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
          queryAccepted: mapped.queryAccepted === true && !interpFailed,
          queryFailed: interpFailed,
          observedValue: mapped.observedValue === true,
          observedNull: mapped.coverage.nullBucketCount > 0 && mapped.coverage.validValueBucketCount === 0,
          notObserved: mapped.queryAccepted !== true,
        };

        await this.persistence.recordSignalEvidence({
          ...input.writeAuth(),
          stageId: historicalStageId,
          stageType: 'HISTORICAL',
          signalName: field.fieldName,
          evidenceState: mapFsd3PlannerEvidenceToPersistenceState(dimensions),
          declaredByProvider: true,
          schemaShape: shape,
          queryPlanned: true,
          queryAccepted: dimensions.queryAccepted ?? null,
          observedValue: dimensions.observedValue ?? null,
          provenanceJson: {
            documentFingerprint: doc.fingerprint,
            historicalWindow: { fromUtc: window.fromUtc, toUtc: window.toUtc },
          },
          qualityJson: mapped.qualityJson,
        });
      }

      const okFin = await this.finalizeHistoricalLedgerAttempt(
        input.writeAuth,
        input.catalogPlanFingerprint,
        input.catalogStageVersionRef,
        input.budget.maxRequestsPerRun,
        doc.fingerprint,
        'SUCCEEDED',
        providerResponse.httpStatus,
      );
      if (!okFin) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_LEDGER_FINALIZE_CAS_FAILED',
        });
      }

      checkpoint.completedDocumentFingerprints.push(doc.fingerprint);
      checkpoint.nextDocumentIndex = index + 1;
      chunksExecuted += 1;

      const cpAdv = await this.persistence.advanceStageCheckpoint({
        auth: input.writeAuth(),
        stageType: 'HISTORICAL',
        expectedStageVersion: historicalStageVersion,
        planFingerprint: input.historicalPlanFingerprint,
        checkpointJson: histCpPayload(checkpoint),
      });
      if (!cpAdv.applied) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_CHECKPOINT_CAS_FAILED',
        });
      }
      historicalStageVersion = cpAdv.stageVersion;
      await this.testHooks?.afterHistoricalChunkCompleted?.(index);
    }

    if (!unknownOutcome) {
      const done = await this.persistence.transitionStageStatus({
        auth: input.writeAuth(),
        stageType: 'HISTORICAL',
        expectedStageVersion: historicalStageVersion,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUCCEEDED',
      });
      if (!done.applied) {
        return buildTerminalFailureResult({
          runId: input.runId,
          reason: 'HISTORICAL_COMPLETE_CAS_FAILED',
        });
      }
    }

    const summary = await this.persistence.summarizeRunEvidenceForOrchestration(input.runId);

    return this.finalizeHistoricalRun({
      scope: input.scope,
      runId: input.runId,
      writeAuth: input.writeAuth,
      runVersionRef: input.runVersionRef,
      catalogSignalCount: input.catalogSignals.length,
      historicalChunksExecuted: checkpoint.completedDocumentFingerprints.length,
      expectedBucketPositions: expectedBuckets,
      signalsWithHistoricalCoverage: signalsWithCoverage,
      unknownOutcome,
      hasDeferred: plan.deferredSignals.length > 0,
      hasRejections: checkpoint.rejectedQueryFingerprints.length > 0,
      historicalTerminal: unknownOutcome ? 'UNKNOWN_OUTCOME' : 'SUCCEEDED',
    });
  }

  private async finalizeHistoricalRun(input: {
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string };
    runId: string;
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    runVersionRef: { value: number };
    catalogSignalCount: number;
    historicalChunksExecuted: number;
    expectedBucketPositions: number;
    signalsWithHistoricalCoverage: number;
    unknownOutcome: boolean;
    hasDeferred: boolean;
    hasRejections: boolean;
    historicalTerminal: string;
  }): Promise<Fsd4OrchestrationRunResultV1> {
    const allSucceeded =
      !input.unknownOutcome &&
      (input.historicalTerminal === 'SUCCEEDED' || input.historicalTerminal === 'SKIPPED') &&
      !input.hasRejections &&
      !input.hasDeferred;
    const runTarget = input.unknownOutcome
      ? 'FAILED'
      : input.historicalTerminal === 'SUCCEEDED' || input.historicalTerminal === 'SKIPPED'
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

    return {
      status: clientStatus,
      runId: input.runId,
      catalogSignalCount: input.catalogSignalCount,
      historicalChunksExecuted: input.historicalChunksExecuted,
      signalsWithHistoricalCoverage: input.signalsWithHistoricalCoverage,
      expectedBucketPositions: input.expectedBucketPositions,
      unknownOutcomeStage: input.unknownOutcome,
    };
  }

  private async derivePersistedRunResult(
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    runId: string,
  ): Promise<Fsd4OrchestrationRunResultV1> {
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

    const catalogCp = readCatalogCheckpointFromBundle(bundle);
    const declaredCatalogCount = catalogCp?.catalogFetch?.availableSignalNames?.length ?? 0;

    const summary = await this.persistence.summarizeRunEvidenceForOrchestration(runId);
    const hist = findFsd4StageInBundle(bundle, 'HISTORICAL');
    const unknownOutcomeStage = hist?.status === 'UNKNOWN_OUTCOME';
    const progress = parseHistoricalProgressFromBundle(bundle);
    const hasRejections = progress.rejectedQueryFingerprints.length > 0;
    const deferred =
      (await this.persistence.summarizeRunEvidenceForOrchestration(runId)).deferredSignalCount > 0;

    let status: 'COMPLETED' | 'PARTIAL';
    if (unknownOutcomeStage || hasRejections || deferred) {
      status = 'PARTIAL';
    } else {
      status = 'COMPLETED';
    }

    const window = readHistoricalWindowFromBundle(bundle);

    return {
      status,
      runId,
      catalogSignalCount: declaredCatalogCount > 0 ? declaredCatalogCount : summary.catalogSignalCount,
      historicalChunksExecuted: progress.completedDocumentFingerprints.length,
      signalsWithHistoricalCoverage: summary.historicalCoverageSignalCount,
      expectedBucketPositions: window ? computeExpectedBucketPositions(window) : 0,
      unknownOutcomeStage,
    };
  }

  private async mutateCatalogLedgerCas(input: {
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1;
    catalogStageVersionRef: { value: number };
    planFingerprint: string;
    budgetTotal: number;
    mutate: (checkpoint: Fsd4CatalogStageCheckpointV1) => Fsd4CatalogStageCheckpointV1;
  }): Promise<{ applied: boolean; checkpoint: Fsd4CatalogStageCheckpointV1 | null }> {
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
        requestLedger: finalizeFsd4ProviderRequestAttempt({
          ledger: cp.requestLedger,
          queryFingerprint: CATALOG_QUERY_FP,
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
        requestLedger: finalizeFsd4ProviderRequestAttempt({
          ledger: cp.requestLedger,
          queryFingerprint: CATALOG_QUERY_FP,
          outcome: 'UNKNOWN',
        }),
      }),
    });
    return fin.applied;
  }

  private async finalizeHistoricalLedgerAttempt(
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
    planFingerprint: string,
    catalogStageVersionRef: { value: number },
    budgetTotal: number,
    queryFingerprint: string,
    outcome: 'FAILED' | 'SUCCEEDED' | 'UNKNOWN',
    httpStatus?: number,
  ): Promise<boolean> {
    const fin = await this.mutateCatalogLedgerCas({
      writeAuth,
      catalogStageVersionRef,
      planFingerprint,
      budgetTotal,
      mutate: (cp) => ({
        ...cp,
        requestLedger: finalizeFsd4ProviderRequestAttempt({
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
    await this.failRun(scope, runId, runVersionRef, writeAuth);
  }

  private async failRun(
    scope: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
    runId: string,
    runVersionRef: { value: number },
    writeAuth: () => FsdDiscoveryWriteAuthorizationV1,
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
