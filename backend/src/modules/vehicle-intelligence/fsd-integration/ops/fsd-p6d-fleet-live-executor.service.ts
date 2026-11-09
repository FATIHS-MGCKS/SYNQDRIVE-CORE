import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-provider.port.v1';
import { FsdDimoAdapterFactoryService } from '../fsd-dimo-adapter-factory.service';
import { Fsd3OneShotPreflightService } from './fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from './fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from './fsd4-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from './fsd3-discovery-run-inspector.service';
import {
  assertFsdP6cFleetManifestOrderV1,
  type FsdP6cFleetManifestV1,
} from './p6c/fsd-p6c-fleet-manifest.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from './p6c/fsd-p6c-fleet-plan.v1';
import {
  assertFsdP6cProviderBudgetGuardV1,
  evaluateFsdP6cProviderBudgetGuardV1,
} from './p6c/fsd-p6c-provider-budget-guard.v1';
import { resolveP6cCliBudgetFromManifest } from './p6c/fsd-p6c-cli-budget.v1';
import { assertProductionFleetBindingsForLiveV1 } from './p6d/fsd-p6d-production-bindings-guard.v1';
import { assertProductionFleetManifestV1 } from './p6c/fsd-p6c-production-manifest-guard.v1';
import {
  resolveFsdP6dCatalogEvidenceV1,
  type FsdP6dVerifiedCatalogEvidenceV1,
} from './p6d/fsd-p6d-catalog-provenance.v1';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './p6d/fsd-p6d-catalog-provenance-authority.v1';
import {
  assertFsdP6dLiveFleetExecuteGateV1,
  isFsdP6dForceMockTransportV1,
} from './p6d/fsd-p6d-live-fleet-gate.v1';
import { assertFsdP6dProviderPreDispatchGateV1 } from './p6d/fsd-p6d-pre-dispatch-gate.v1';
import { resolveFsdP6dFleetProviderBundleV1 } from './p6d/fsd-p6d-fleet-live-ports.v1';
import { classifyFsdP6dFleetDiscoveryOutcomeV1 } from './p6d/fsd-p6d-discovery-outcome.v1';
import {
  buildFsdP6dVehicleEvaluationReportV1,
  type FsdP6dVehicleEvaluationReportV1,
} from './p6d/fsd-p6d-fleet-evaluation-report.v1';
import {
  assertFsd3TerminalAllowsFsd4ReuseV1,
  assertFsd4TerminalAllowsFleetContinueV1,
  assertInspectorNoUnknownOutcomeStopV1,
} from './p6c/fsd-p6c-fsd3-fsd4-chain-guard.v1';
import {
  buildFsdP6cLiveTestGoNoGoV1,
  resolveFsdP6cArchitectureReviewClearedV1,
} from './p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from './fsd3-one-shot-live-owner-gate.v1';
import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';
import {
  assertFsdP6dPrepareExecuteIdentityFreezeV1,
  buildFsdP6dVehicleIdentityFreezeV1,
  type FsdP6dVehicleIdentityFreezeV1,
} from './p6d/fsd-p6d-identity-freeze.v1';
import { dispatchFsdP6dCatalogWithLedgerV1 } from './p6d/fsd-p6d-catalog-ledger-dispatch.v1';
import {
  assertFsdP6dFleetPrepareArtifactForExecuteV1,
  finalizeFsdP6dFleetPrepareArtifactV1,
  type FsdP6dFleetPrepareArtifactV1,
  type FsdP6dFleetPrepareVehicleBindingV1,
} from './p6d/fsd-p6d-fleet-prepare-artifact.v1';
import { assertFsdP6dFsd3RunCatalogConsistencyV1 } from './p6d/fsd-p6d-fsd3-catalog-consistency.v1';

export type FsdP6dFleetLivePrepareReportV1 = {
  status: 'LIVE_FLEET_PREPARED';
  fleetPrepareRequestKey: string;
  prepareArtifact: FsdP6dFleetPrepareArtifactV1;
  catalogEvidence: Array<{
    label: string;
    vehicleId: string;
    catalogStatus: 'VERIFIED' | 'CATALOG_PENDING';
    evidence: FsdP6dVerifiedCatalogEvidenceV1 | null;
  }>;
  identityFreeze: FsdP6dVehicleIdentityFreezeV1[];
  planReport: ReturnType<typeof buildFsdP6cFleetDiscoveryPlanReportV1>;
  providerBudgetGuard: ReturnType<typeof evaluateFsdP6cProviderBudgetGuardV1>;
  goNoGo: ReturnType<typeof buildFsdP6cLiveTestGoNoGoV1>;
};

export type FsdP6dFleetLiveExecutionRecordV1 = FsdP6dVehicleEvaluationReportV1 & {
  fleetStopped: boolean;
  stopReason?: string;
};

@Injectable()
export class FsdP6dFleetLiveExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflightSvc: Fsd3OneShotPreflightService,
    private readonly fsd3ExecutionSvc: Fsd3OneShotExecutionService,
    private readonly fsd4ExecutionSvc: Fsd4OneShotExecutionService,
    private readonly inspectorSvc: Fsd3DiscoveryRunInspectorService,
    @Optional() private readonly adapterFactory?: FsdDimoAdapterFactoryService,
  ) {}

  private resolveHistoricalWindow(
    manifest: FsdP6cFleetManifestV1,
    label: string,
  ): FsdHistoricalWindowV1 {
    const entry = manifest.vehicles.find((v) => v.label === label);
    return entry?.historicalWindow ?? manifest.historicalWindow;
  }

  private async loadVerifiedCatalogEvidenceByRunId(input: {
    runId: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<FsdP6dVerifiedCatalogEvidenceV1> {
    const run = await this.prisma.fsdDiscoveryRun.findUnique({
      where: { id: input.runId },
      include: { stages: { where: { stageType: 'CATALOG', status: 'SUCCEEDED' }, take: 1 } },
    });
    if (!run?.stages[0]) {
      throw new Error('FSD_P6D_CATALOG_RUN_NOT_FOUND');
    }
    const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
    if (!checkpoint) {
      throw new Error('FSD_P6D_CATALOG_CHECKPOINT_NOT_FOUND');
    }
    const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
      env: input.env,
      context: {
        runId: run.id,
        runKey: run.runKey,
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        providerSourceLinkId: run.providerSourceLinkId,
        dimoTokenId: run.dimoTokenId!,
        connectionIdentityFingerprint: run.connectionIdentityFingerprint!,
        invalidatedAt: run.invalidatedAt,
        checkpoint,
        stageHttpStatus: run.stages[0].lastHttpStatus,
      },
    });
    return {
      source: 'PERSISTED_FSD3_RUN',
      provenanceClass:
        authoritative.provenance.class === 'LIVE_DIMO_VERIFIED'
          ? 'LIVE_DIMO_VERIFIED'
          : 'INTEGRATION_MOCK_DISPOSABLE',
      availableSignals: authoritative.availableSignals,
      declaredCatalogFingerprint: authoritative.declaredCatalogFingerprint,
      connectionIdentityFingerprint: run.connectionIdentityFingerprint!,
      dimoTokenId: run.dimoTokenId!,
      persistedRunId: run.id,
      httpStatus: checkpoint.catalogFetch?.httpStatus ?? run.stages[0].lastHttpStatus ?? 200,
      providerSourceLinkId: run.providerSourceLinkId,
    };
  }

  async prepareLiveFleetExecution(input: {
    manifest: FsdP6cFleetManifestV1;
    actorUserId: string;
    releaseSha: string;
    fleetPrepareRequestKey: string;
    env?: NodeJS.ProcessEnv;
    allowLiveCatalogDispatch?: boolean;
    liveCatalogProvider?: Fsd3DiscoveryProviderPortV1;
  }): Promise<FsdP6dFleetLivePrepareReportV1> {
    const env = input.env ?? process.env;
    const forceMockTransport = isFsdP6dForceMockTransportV1(env);
    assertProductionFleetBindingsForLiveV1(input.manifest);
    assertFsdP6cFleetManifestOrderV1(input.manifest);

    const tokenMap = new Map<string, number>();
    const preliminaryFields = new Map<string, readonly string[]>();
    const evidenceByVehicle = new Map<string, FsdP6dVerifiedCatalogEvidenceV1>();
    const catalogRows: FsdP6dFleetLivePrepareReportV1['catalogEvidence'] = [];
    const artifactVehicles: FsdP6dFleetPrepareVehicleBindingV1[] = [];

    for (const vehicle of input.manifest.vehicles) {
      const preflight = await this.preflightSvc.runAuthorizedReadOnlyPreflight({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
        },
        actorUserId: input.actorUserId,
      });
      if (preflight.dimoTokenId == null) {
        throw new Error(`FSD_P6D_PREFLIGHT_TOKEN_MISSING_${vehicle.label}`);
      }
      tokenMap.set(vehicle.vehicleId, preflight.dimoTokenId);

      const resolution = await resolveFsdP6dCatalogEvidenceV1({
        prisma: this.prisma,
        env,
        preflight,
        organizationId: input.manifest.organizationId,
        vehicleId: vehicle.vehicleId,
        providerSourceLinkId: vehicle.providerSourceLinkId,
        manifestDeclaredFieldNames: vehicle.declaredFieldNames,
        allowCatalogPending: true,
      });

      const historicalWindow = this.resolveHistoricalWindow(input.manifest, vehicle.label);

      if (resolution.kind === 'VERIFIED') {
        preliminaryFields.set(vehicle.vehicleId, resolution.evidence.availableSignals);
        evidenceByVehicle.set(vehicle.vehicleId, resolution.evidence);
        catalogRows.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogStatus: 'VERIFIED',
          evidence: resolution.evidence,
        });
        artifactVehicles.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
          historicalRequestKey: vehicle.historicalRequestKey,
          historicalWindow,
          dimoTokenId: preflight.dimoTokenId,
          connectionIdentityFingerprint: preflight.connectionIdentityFingerprint!,
          declaredCatalogFingerprint: resolution.evidence.declaredCatalogFingerprint,
          catalogPersistedRunId: resolution.evidence.persistedRunId,
          catalogEvidenceSource: 'PERSISTED_FSD3_RUN',
        });
      } else {
        preliminaryFields.set(vehicle.vehicleId, []);
        catalogRows.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogStatus: 'CATALOG_PENDING',
          evidence: null,
        });
        artifactVehicles.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
          historicalRequestKey: vehicle.historicalRequestKey,
          historicalWindow,
          dimoTokenId: preflight.dimoTokenId,
          connectionIdentityFingerprint: preflight.connectionIdentityFingerprint!,
          declaredCatalogFingerprint: '',
          catalogPersistedRunId: null,
          catalogEvidenceSource: 'PENDING',
        });
      }
    }

    const bootstrapManifest: FsdP6cFleetManifestV1 = {
      ...input.manifest,
      vehicles: input.manifest.vehicles.map((v) => ({
        ...v,
        declaredFieldNames: preliminaryFields.get(v.vehicleId) ?? [],
      })),
    };

    let planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest: bootstrapManifest,
      tokenIdByVehicleId: tokenMap,
      allowCatalogPending: true,
    });

    const goNoGoBootstrap = buildFsdP6cLiveTestGoNoGoV1({
      planReport,
      providerBudgetGuard: evaluateFsdP6cProviderBudgetGuardV1(planReport),
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] === '1',
      productionManifestValid: true,
      architectureReviewCleared: resolveFsdP6cArchitectureReviewClearedV1(env),
    });

    if (input.allowLiveCatalogDispatch && input.liveCatalogProvider) {
      assertFsdP6dProviderPreDispatchGateV1({
        env,
        context: 'PREPARE_CATALOG_FETCH',
        releaseSha: input.releaseSha,
        goNoGo: goNoGoBootstrap,
        planReport,
        manifest: input.manifest,
        forceMockTransport,
      });

      const liveProvider = forceMockTransport ? 'mock' : 'dimo_live';
      const budget = resolveP6cCliBudgetFromManifest(input.manifest);

      for (const vehicle of input.manifest.vehicles) {
        if (evidenceByVehicle.has(vehicle.vehicleId)) {
          continue;
        }
        const preflight = await this.preflightSvc.runAuthorizedReadOnlyPreflight({
          scope: {
            organizationId: input.manifest.organizationId,
            vehicleId: vehicle.vehicleId,
            providerSourceLinkId: vehicle.providerSourceLinkId,
            discoveryRequestKey: vehicle.discoveryRequestKey,
          },
          actorUserId: input.actorUserId,
        });
        const dispatch = await dispatchFsdP6dCatalogWithLedgerV1({
          prisma: this.prisma,
          env,
          executionSvc: this.fsd3ExecutionSvc,
          scope: {
            organizationId: input.manifest.organizationId,
            vehicleId: vehicle.vehicleId,
            providerSourceLinkId: vehicle.providerSourceLinkId,
            discoveryRequestKey: vehicle.discoveryRequestKey,
          },
          preflight,
          liveProvider,
          provider: input.liveCatalogProvider,
          releaseSha: input.releaseSha,
          budget,
        });
        const evidence: FsdP6dVerifiedCatalogEvidenceV1 = {
          source: 'LIVE_CATALOG_LEDGER',
          provenanceClass:
            liveProvider === 'mock' ? 'INTEGRATION_MOCK_DISPOSABLE' : 'LIVE_DIMO_VERIFIED',
          availableSignals: dispatch.availableSignals,
          declaredCatalogFingerprint: dispatch.declaredCatalogFingerprint,
          connectionIdentityFingerprint: preflight.connectionIdentityFingerprint!,
          dimoTokenId: preflight.dimoTokenId!,
          persistedRunId: dispatch.persistedRunId,
          httpStatus: dispatch.httpStatus,
          providerSourceLinkId: vehicle.providerSourceLinkId,
        };
        evidenceByVehicle.set(vehicle.vehicleId, evidence);
        preliminaryFields.set(vehicle.vehicleId, evidence.availableSignals);
        const rowIdx = catalogRows.findIndex((r) => r.vehicleId === vehicle.vehicleId);
        if (rowIdx >= 0) {
          catalogRows[rowIdx] = {
            label: vehicle.label,
            vehicleId: vehicle.vehicleId,
            catalogStatus: 'VERIFIED',
            evidence,
          };
        }
        const artIdx = artifactVehicles.findIndex((v) => v.vehicleId === vehicle.vehicleId);
        if (artIdx >= 0) {
          artifactVehicles[artIdx] = {
            ...artifactVehicles[artIdx]!,
            declaredCatalogFingerprint: evidence.declaredCatalogFingerprint,
            catalogPersistedRunId: evidence.persistedRunId,
            catalogEvidenceSource: 'LIVE_CATALOG_LEDGER',
          };
        }
      }

      planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
        manifest: {
          ...input.manifest,
          vehicles: input.manifest.vehicles.map((v) => ({
            ...v,
            declaredFieldNames: preliminaryFields.get(v.vehicleId) ?? [],
            catalogProvenance: 'VERIFIED_LIVE_CATALOG',
          })),
        },
        tokenIdByVehicleId: tokenMap,
        allowCatalogPending: false,
      });
    }

    const providerBudgetGuard = evaluateFsdP6cProviderBudgetGuardV1(planReport);
    let productionManifestValid = false;
    try {
      assertProductionFleetManifestV1({
        ...input.manifest,
        vehicles: input.manifest.vehicles.map((v) => ({
          ...v,
          declaredFieldNames: preliminaryFields.get(v.vehicleId) ?? [],
          catalogProvenance:
            (preliminaryFields.get(v.vehicleId) ?? []).length > 0 ? 'VERIFIED_LIVE_CATALOG' : undefined,
        })),
      });
      productionManifestValid = true;
    } catch {
      productionManifestValid = false;
    }

    const goNoGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport,
      providerBudgetGuard,
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] === '1',
      productionManifestValid,
      architectureReviewCleared: resolveFsdP6cArchitectureReviewClearedV1(env),
    });

    const identityFreeze = catalogRows
      .filter((row): row is typeof row & { evidence: FsdP6dVerifiedCatalogEvidenceV1 } =>
        Boolean(row.evidence),
      )
      .map((row) => {
        const vehicle = input.manifest.vehicles.find((v) => v.vehicleId === row.vehicleId)!;
        return buildFsdP6dVehicleIdentityFreezeV1({
          vehicleId: row.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          historicalWindow: this.resolveHistoricalWindow(input.manifest, vehicle.label),
          evidence: row.evidence,
        });
      });

    const prepareArtifact = finalizeFsdP6dFleetPrepareArtifactV1({
      schemaVersion: 'FSD_P6D_FLEET_PREPARE_ARTIFACT_V1',
      fleetPrepareRequestKey: input.fleetPrepareRequestKey,
      releaseSha: input.releaseSha,
      organizationId: input.manifest.organizationId,
      preparedAtUtc: new Date().toISOString(),
      providerBudgetFleetPlanned: planReport.fleetCumulativePlannedProviderRequests,
      vehicles: artifactVehicles,
    });

    return {
      status: 'LIVE_FLEET_PREPARED',
      fleetPrepareRequestKey: input.fleetPrepareRequestKey,
      prepareArtifact,
      catalogEvidence: catalogRows,
      identityFreeze,
      planReport,
      providerBudgetGuard,
      goNoGo,
    };
  }

  async executeFleetSequentialLive(input: {
    manifest: FsdP6cFleetManifestV1;
    actorUserId: string;
    releaseSha: string;
    fleetPrepareRequestKey: string;
    prepareArtifact: FsdP6dFleetPrepareArtifactV1;
    env?: NodeJS.ProcessEnv;
  }): Promise<{
    status: 'EXECUTE_LIVE_FLEET' | 'EXECUTE_LIVE_FLEET_STOPPED';
    releaseSha: string;
    planReport: ReturnType<typeof buildFsdP6cFleetDiscoveryPlanReportV1>;
    vehicles: FsdP6dFleetLiveExecutionRecordV1[];
    fleetStopped: boolean;
    stopReason?: string;
    gateBundle: ReturnType<typeof assertFsdP6dLiveFleetExecuteGateV1>;
  }> {
    const env = input.env ?? process.env;
    const forceMockTransport = isFsdP6dForceMockTransportV1(env);

    assertFsdP6dFleetPrepareArtifactForExecuteV1({
      artifact: input.prepareArtifact,
      manifest: input.manifest,
      releaseSha: input.releaseSha,
      fleetPrepareRequestKey: input.fleetPrepareRequestKey,
    });

    const tokenMap = new Map<string, number>();
    const fields = new Map<string, readonly string[]>();
    const evidenceByVehicle = new Map<string, FsdP6dVerifiedCatalogEvidenceV1>();
    const freezeByVehicle = new Map<string, FsdP6dVehicleIdentityFreezeV1>();

    for (const binding of input.prepareArtifact.vehicles) {
      tokenMap.set(binding.vehicleId, binding.dimoTokenId);
      const evidence = await this.loadVerifiedCatalogEvidenceByRunId({
        runId: binding.catalogPersistedRunId!,
        env,
      });
      fields.set(binding.vehicleId, evidence.availableSignals);
      evidenceByVehicle.set(binding.vehicleId, evidence);
      freezeByVehicle.set(
        binding.vehicleId,
        buildFsdP6dVehicleIdentityFreezeV1({
          vehicleId: binding.vehicleId,
          providerSourceLinkId: binding.providerSourceLinkId,
          historicalWindow: binding.historicalWindow,
          evidence,
        }),
      );
    }

    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest: {
        ...input.manifest,
        vehicles: input.manifest.vehicles.map((v) => ({
          ...v,
          declaredFieldNames: fields.get(v.vehicleId) ?? [],
          catalogProvenance: 'VERIFIED_LIVE_CATALOG',
        })),
      },
      tokenIdByVehicleId: tokenMap,
      allowCatalogPending: false,
    });

    assertFsdP6cProviderBudgetGuardV1(planReport);
    const providerBudgetGuard = evaluateFsdP6cProviderBudgetGuardV1(planReport);
    const goNoGo = buildFsdP6cLiveTestGoNoGoV1({
      planReport,
      providerBudgetGuard,
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] === '1',
      productionManifestValid: true,
      architectureReviewCleared: resolveFsdP6cArchitectureReviewClearedV1(env),
    });

    assertFsdP6dProviderPreDispatchGateV1({
      env,
      context: 'EXECUTE_FLEET',
      releaseSha: input.releaseSha,
      goNoGo,
      planReport,
      manifest: input.manifest,
      forceMockTransport,
    });

    const gateBundle = assertFsdP6dLiveFleetExecuteGateV1({
      env,
      releaseSha: input.releaseSha,
      manifest: input.manifest,
      goNoGo,
      liveProvider: 'dimo_live',
      forceMockTransport,
    });

    const budget = resolveP6cCliBudgetFromManifest(input.manifest);
    const records: FsdP6dFleetLiveExecutionRecordV1[] = [];
    let fleetStopped = false;
    let stopReason: string | undefined;
    const planVehicleByLabel = new Map(planReport.vehicles.map((v) => [v.label, v]));

    for (const vehicle of input.manifest.vehicles) {
      if (fleetStopped) {
        break;
      }

      const preflight = await this.preflightSvc.runAuthorizedReadOnlyPreflight({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
        },
        actorUserId: input.actorUserId,
      });

      const catalog = evidenceByVehicle.get(vehicle.vehicleId);
      const freeze = freezeByVehicle.get(vehicle.vehicleId);
      if (!catalog || !freeze) {
        throw new Error(`FSD_P6D_PREPARE_FREEZE_MISSING_${vehicle.label}`);
      }

      const historicalWindow = this.resolveHistoricalWindow(input.manifest, vehicle.label);
      assertFsdP6dPrepareExecuteIdentityFreezeV1({
        label: vehicle.label,
        freeze,
        providerSourceLinkId: vehicle.providerSourceLinkId,
        connectionIdentityFingerprint: preflight.connectionIdentityFingerprint,
        dimoTokenId: preflight.dimoTokenId,
        evidence: catalog,
        historicalWindow,
      });

      const providerBundle = resolveFsdP6dFleetProviderBundleV1({
        env,
        adapterFactory: this.adapterFactory,
        catalogSignals: catalog.availableSignals,
      });

      const fsd3 = await this.fsd3ExecutionSvc.executeOneShot({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
        },
        preflight,
        liveProvider: providerBundle.transportLabel === 'mock' ? 'mock' : 'dimo_live',
        provider: providerBundle.fsd3Provider,
        budget,
        releaseSha: input.releaseSha,
      });

      const planRow = planVehicleByLabel.get(vehicle.label);
      if (!planRow) {
        throw new Error(`FSD_P6D_PLAN_ROW_MISSING_${vehicle.label}`);
      }

      try {
        assertFsd3TerminalAllowsFsd4ReuseV1(fsd3);
        await assertFsdP6dFsd3RunCatalogConsistencyV1({
          prisma: this.prisma,
          env,
          label: vehicle.label,
          approvedEvidence: catalog,
          fsd3RunId: fsd3.runId,
        });
      } catch (err) {
        fleetStopped = true;
        stopReason = err instanceof Error ? err.message : String(err);
        const classification = classifyFsdP6dFleetDiscoveryOutcomeV1({
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: 'BLOCKED',
          planCompleteness: planReport.planCompleteness,
          allExecutable: planReport.allExecutable,
        });
        records.push({
          ...buildFsdP6dVehicleEvaluationReportV1({
            label: vehicle.label,
            vehicleId: vehicle.vehicleId,
            catalogEvidence: catalog,
            planRow,
            planCompleteness: planReport.planCompleteness,
            allExecutable: planReport.allExecutable,
            fsd3RunId: fsd3.runId,
            fsd4RunId: '',
            fsd3TerminalStatus: fsd3.terminalStatus,
            fsd4TerminalStatus: 'BLOCKED',
            fsd3Inspector: null,
            fsd4Inspector: null,
            classification,
          }),
          fleetStopped: true,
          stopReason,
        });
        break;
      }

      const fsd4 = await this.fsd4ExecutionSvc.executeHistoricalOneShot({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          historicalRequestKey: vehicle.historicalRequestKey,
        },
        preflight,
        liveProvider: providerBundle.transportLabel === 'mock' ? 'mock' : 'dimo_live',
        provider: providerBundle.fsd4Provider,
        historicalWindow,
        budget,
        verifiedFsd3CatalogRunId: fsd3.runId,
        releaseSha: input.releaseSha,
      });

      const fsd3Inspector =
        fsd3.runId ?
          await this.inspectorSvc.inspectTenantScoped({
            actorUserId: input.actorUserId,
            organizationId: input.manifest.organizationId,
            runId: fsd3.runId,
          })
        : null;
      const fsd4Inspector =
        fsd4.runId ?
          await this.inspectorSvc.inspectTenantScoped({
            actorUserId: input.actorUserId,
            organizationId: input.manifest.organizationId,
            runId: fsd4.runId,
          })
        : null;

      try {
        assertInspectorNoUnknownOutcomeStopV1(`${vehicle.label}_FSD3`, fsd3Inspector);
        assertFsd4TerminalAllowsFleetContinueV1(fsd4);
        assertInspectorNoUnknownOutcomeStopV1(`${vehicle.label}_FSD4`, fsd4Inspector);
      } catch (err) {
        fleetStopped = true;
        stopReason = err instanceof Error ? err.message : String(err);
        const classification = classifyFsdP6dFleetDiscoveryOutcomeV1({
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: fsd4.terminalStatus,
          planCompleteness: planReport.planCompleteness,
          allExecutable: planReport.allExecutable,
        });
        records.push({
          ...buildFsdP6dVehicleEvaluationReportV1({
            label: vehicle.label,
            vehicleId: vehicle.vehicleId,
            catalogEvidence: catalog,
            planRow,
            planCompleteness: planReport.planCompleteness,
            allExecutable: planReport.allExecutable,
            fsd3RunId: fsd3.runId,
            fsd4RunId: fsd4.runId,
            fsd3TerminalStatus: fsd3.terminalStatus,
            fsd4TerminalStatus: fsd4.terminalStatus,
            fsd3Inspector,
            fsd4Inspector,
            classification,
          }),
          fleetStopped: true,
          stopReason,
        });
        break;
      }

      const classification = classifyFsdP6dFleetDiscoveryOutcomeV1({
        fsd3TerminalStatus: fsd3.terminalStatus,
        fsd4TerminalStatus: fsd4.terminalStatus,
        planCompleteness: planReport.planCompleteness,
        allExecutable: planReport.allExecutable,
      });

      records.push({
        ...buildFsdP6dVehicleEvaluationReportV1({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogEvidence: catalog,
          planRow,
          planCompleteness: planReport.planCompleteness,
          allExecutable: planReport.allExecutable,
          fsd3RunId: fsd3.runId,
          fsd4RunId: fsd4.runId,
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: fsd4.terminalStatus,
          fsd3Inspector,
          fsd4Inspector,
          classification,
        }),
        fleetStopped: false,
      });
    }

    return {
      status: fleetStopped ? 'EXECUTE_LIVE_FLEET_STOPPED' : 'EXECUTE_LIVE_FLEET',
      releaseSha: input.releaseSha,
      planReport,
      vehicles: records,
      fleetStopped,
      stopReason,
      gateBundle,
    };
  }
}
