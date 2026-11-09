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
  fetchLiveCatalogEvidenceV1,
  resolveFsdP6dCatalogEvidenceV1,
  type FsdP6dVerifiedCatalogEvidenceV1,
} from './p6d/fsd-p6d-catalog-provenance.v1';
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
import { FsdP6cFleetDiscoveryService } from './fsd-p6c-fleet-discovery.service';
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

export type FsdP6dFleetLivePrepareReportV1 = {
  status: 'LIVE_FLEET_PREPARED';
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
    private readonly fleetPreflightSvc: FsdP6cFleetDiscoveryService,
    @Optional() private readonly adapterFactory?: FsdDimoAdapterFactoryService,
  ) {}

  private resolveHistoricalWindow(
    manifest: FsdP6cFleetManifestV1,
    label: string,
  ): FsdHistoricalWindowV1 {
    const entry = manifest.vehicles.find((v) => v.label === label);
    return entry?.historicalWindow ?? manifest.historicalWindow;
  }

  async prepareLiveFleetExecution(input: {
    manifest: FsdP6cFleetManifestV1;
    actorUserId: string;
    releaseSha: string;
    env?: NodeJS.ProcessEnv;
    allowLiveCatalogDispatch?: boolean;
    liveCatalogProvider?: Fsd3DiscoveryProviderPortV1;
  }): Promise<FsdP6dFleetLivePrepareReportV1> {
    const env = input.env ?? process.env;
    assertProductionFleetBindingsForLiveV1(input.manifest);
    assertFsdP6cFleetManifestOrderV1(input.manifest);

    const tokenMap = new Map<string, number>();
    const preliminaryFields = new Map<string, readonly string[]>();
    const catalogRows: FsdP6dFleetLivePrepareReportV1['catalogEvidence'] = [];

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

      if (resolution.kind === 'VERIFIED') {
        preliminaryFields.set(vehicle.vehicleId, resolution.evidence.availableSignals);
        catalogRows.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogStatus: 'VERIFIED',
          evidence: resolution.evidence,
        });
      } else {
        preliminaryFields.set(vehicle.vehicleId, []);
        catalogRows.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogStatus: 'CATALOG_PENDING',
          evidence: null,
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
      for (let i = 0; i < catalogRows.length; i += 1) {
        const row = catalogRows[i]!;
        if (row.catalogStatus !== 'CATALOG_PENDING') {
          continue;
        }
        const vehicle = input.manifest.vehicles.find((v) => v.vehicleId === row.vehicleId);
        if (!vehicle) {
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
        const evidence = await fetchLiveCatalogEvidenceV1({
          env,
          provider: input.liveCatalogProvider,
          preflight,
          manifest: input.manifest,
          planReport,
          goNoGo: goNoGoBootstrap,
          releaseSha: input.releaseSha,
          dispatchContext: {
            organizationId: input.manifest.organizationId,
            vehicleId: vehicle.vehicleId,
            providerSourceLinkId: vehicle.providerSourceLinkId,
            runKey: `catalog-prep-${vehicle.discoveryRequestKey}`,
            dimoTokenId: preflight.dimoTokenId!,
            connectionIdentityFingerprint: preflight.connectionIdentityFingerprint!,
          },
        });
        preliminaryFields.set(vehicle.vehicleId, evidence.availableSignals);
        catalogRows[i] = {
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogStatus: 'VERIFIED',
          evidence,
        };
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

    const dynamicManifest: FsdP6cFleetManifestV1 = {
      ...input.manifest,
      vehicles: input.manifest.vehicles.map((v) => ({
        ...v,
        declaredFieldNames: preliminaryFields.get(v.vehicleId) ?? [],
        catalogProvenance:
          (preliminaryFields.get(v.vehicleId) ?? []).length > 0
            ? 'VERIFIED_LIVE_CATALOG'
            : undefined,
      })),
    };

    const providerBudgetGuard = evaluateFsdP6cProviderBudgetGuardV1(planReport);
    let productionManifestValid = false;
    try {
      assertProductionFleetManifestV1(dynamicManifest);
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
      .map((row) =>
        buildFsdP6dVehicleIdentityFreezeV1({
          vehicleId: row.vehicleId,
          providerSourceLinkId:
            input.manifest.vehicles.find((v) => v.vehicleId === row.vehicleId)!.providerSourceLinkId,
          evidence: row.evidence,
        }),
      );

    return {
      status: 'LIVE_FLEET_PREPARED',
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
    env?: NodeJS.ProcessEnv;
    allowLiveCatalogDispatch?: boolean;
    prepareIdentityFreeze?: FsdP6dVehicleIdentityFreezeV1[];
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
    const liveCatalogProvider =
      input.allowLiveCatalogDispatch && !forceMockTransport && this.adapterFactory
        ? this.adapterFactory.createAdapter().createFsd3Port()
        : undefined;

    const prepared = await this.prepareLiveFleetExecution({
      manifest: input.manifest,
      actorUserId: input.actorUserId,
      releaseSha: input.releaseSha,
      env,
      allowLiveCatalogDispatch: input.allowLiveCatalogDispatch,
      liveCatalogProvider,
    });

    assertFsdP6cProviderBudgetGuardV1(prepared.planReport);

    assertFsdP6dProviderPreDispatchGateV1({
      env,
      context: 'EXECUTE_FLEET',
      releaseSha: input.releaseSha,
      goNoGo: prepared.goNoGo,
      planReport: prepared.planReport,
      manifest: input.manifest,
      forceMockTransport,
    });

    const gateBundle = assertFsdP6dLiveFleetExecuteGateV1({
      env,
      releaseSha: input.releaseSha,
      manifest: input.manifest,
      goNoGo: prepared.goNoGo,
      liveProvider: 'dimo_live',
      forceMockTransport,
    });

    const freezeByVehicle = new Map(
      (input.prepareIdentityFreeze ?? prepared.identityFreeze).map((f) => [f.vehicleId, f]),
    );

    const budget = resolveP6cCliBudgetFromManifest(input.manifest);
    const records: FsdP6dFleetLiveExecutionRecordV1[] = [];
    const evidenceByVehicle = new Map<string, FsdP6dVerifiedCatalogEvidenceV1>();

    for (const row of prepared.catalogEvidence) {
      if (row.evidence) {
        evidenceByVehicle.set(row.vehicleId, row.evidence);
      }
    }

    let fleetStopped = false;
    let stopReason: string | undefined;

    const planVehicleByLabel = new Map(prepared.planReport.vehicles.map((v) => [v.label, v]));

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
      if (!catalog) {
        fleetStopped = true;
        stopReason = `FSD_P6D_CATALOG_PENDING_${vehicle.label}`;
        break;
      }

      const freeze = freezeByVehicle.get(vehicle.vehicleId);
      if (freeze) {
        try {
          assertFsdP6dPrepareExecuteIdentityFreezeV1({
            label: vehicle.label,
            freeze,
            connectionIdentityFingerprint: preflight.connectionIdentityFingerprint,
            dimoTokenId: preflight.dimoTokenId,
            evidence: catalog,
          });
        } catch (err) {
          fleetStopped = true;
          stopReason = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      const providerBundle = resolveFsdP6dFleetProviderBundleV1({
        env,
        adapterFactory: this.adapterFactory,
        catalogSignals: catalog.availableSignals,
      });

      const fsd3Provider: Fsd3DiscoveryProviderPortV1 = providerBundle.fsd3Provider;
      const fsd4Provider: Fsd4HistoricalDiscoveryProviderPortV1 = providerBundle.fsd4Provider;

      const fsd3 = await this.fsd3ExecutionSvc.executeOneShot({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
        },
        preflight,
        liveProvider: providerBundle.transportLabel === 'mock' ? 'mock' : 'dimo_live',
        provider: fsd3Provider,
        budget,
        releaseSha: input.releaseSha,
      });

      const planRow = planVehicleByLabel.get(vehicle.label);
      if (!planRow) {
        throw new Error(`FSD_P6D_PLAN_ROW_MISSING_${vehicle.label}`);
      }

      const planWindow = planRow.historicalWindow;
      const executeWindow = this.resolveHistoricalWindow(input.manifest, vehicle.label);
      if (
        planWindow.fromUtc !== executeWindow.fromUtc ||
        planWindow.toUtc !== executeWindow.toUtc
      ) {
        fleetStopped = true;
        stopReason = `FSD_P6D_HISTORICAL_WINDOW_DRIFT_${vehicle.label}`;
        break;
      }

      try {
        assertFsd3TerminalAllowsFsd4ReuseV1(fsd3);
      } catch (err) {
        fleetStopped = true;
        stopReason = err instanceof Error ? err.message : String(err);
        const classification = classifyFsdP6dFleetDiscoveryOutcomeV1({
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: 'BLOCKED',
          planCompleteness: prepared.planReport.planCompleteness,
          allExecutable: prepared.planReport.allExecutable,
        });
        records.push({
          ...buildFsdP6dVehicleEvaluationReportV1({
            label: vehicle.label,
            vehicleId: vehicle.vehicleId,
            catalogEvidence: catalog,
            planRow,
            planCompleteness: prepared.planReport.planCompleteness,
            allExecutable: prepared.planReport.allExecutable,
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
        provider: fsd4Provider,
        historicalWindow: executeWindow,
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
          planCompleteness: prepared.planReport.planCompleteness,
          allExecutable: prepared.planReport.allExecutable,
        });
        records.push({
          ...buildFsdP6dVehicleEvaluationReportV1({
            label: vehicle.label,
            vehicleId: vehicle.vehicleId,
            catalogEvidence: catalog,
            planRow,
            planCompleteness: prepared.planReport.planCompleteness,
            allExecutable: prepared.planReport.allExecutable,
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
        planCompleteness: prepared.planReport.planCompleteness,
        allExecutable: prepared.planReport.allExecutable,
      });

      records.push({
        ...buildFsdP6dVehicleEvaluationReportV1({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          catalogEvidence: catalog,
          planRow,
          planCompleteness: prepared.planReport.planCompleteness,
          allExecutable: prepared.planReport.allExecutable,
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
      planReport: prepared.planReport,
      vehicles: records,
      fleetStopped,
      stopReason,
      gateBundle,
    };
  }
}
