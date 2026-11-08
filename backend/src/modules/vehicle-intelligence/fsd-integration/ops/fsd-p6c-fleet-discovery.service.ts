import { Injectable } from '@nestjs/common';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-provider.port.v1';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { createFsd4MockHistoricalProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-mock-provider.v1';
import { Fsd3OneShotPreflightService } from './fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from './fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from './fsd4-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from './fsd3-discovery-run-inspector.service';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-types.v1';
import {
  assertFsdP6cFleetManifestOrderV1,
  type FsdP6cFleetManifestV1,
} from './p6c/fsd-p6c-fleet-manifest.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from './p6c/fsd-p6c-fleet-plan.v1';
import {
  assertFsdP6cProviderBudgetGuardV1,
  evaluateFsdP6cProviderBudgetGuardV1,
} from './p6c/fsd-p6c-provider-budget-guard.v1';
import {
  buildFsdP6cLiveTestGoNoGoV1,
  resolveFsdP6cArchitectureReviewClearedV1,
  type FsdP6cGoNoGoContextV1,
} from './p6c/fsd-p6c-go-no-go.v1';
import { resolveP6cCliBudgetFromManifest } from './p6c/fsd-p6c-cli-budget.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from './fsd3-one-shot-live-owner-gate.v1';
import { assertProductionFleetManifestV1 } from './p6c/fsd-p6c-production-manifest-guard.v1';
import { assertFsdP6cMockExecuteDatabaseAllowedV1 } from './p6c/fsd-p6c-mock-execute-db-guard.v1';
import {
  assertFsd3TerminalAllowsFsd4ReuseV1,
  assertFsd4TerminalAllowsFleetContinueV1,
  assertInspectorNoUnknownOutcomeStopV1,
  classifyFsdP6cVehicleDiscoveryOutcomeV1,
} from './p6c/fsd-p6c-fsd3-fsd4-chain-guard.v1';

export type FsdP6cFleetVehicleExecutionRecordV1 = {
  label: string;
  vehicleId: string;
  fsd3RunId: string;
  fsd4RunId: string;
  fsd3TerminalStatus: string;
  fsd4TerminalStatus: string;
  fsd3Inspector: unknown;
  fsd4Inspector: unknown;
  discoveryOutcome: ReturnType<typeof classifyFsdP6cVehicleDiscoveryOutcomeV1>;
  fleetStopped: boolean;
  stopReason?: string;
};

export type FsdP6cFleetDiscoveryPreflightReportV1 = {
  status: 'AUTHORIZED_READ_ONLY_PREFLIGHT';
  planReport: ReturnType<typeof buildFsdP6cFleetDiscoveryPlanReportV1>;
  providerBudgetGuard: ReturnType<typeof evaluateFsdP6cProviderBudgetGuardV1>;
  goNoGo: ReturnType<typeof buildFsdP6cLiveTestGoNoGoV1>;
  vehiclePreflights: Array<{
    label: string;
    vehicleId: string;
    preflight: Awaited<ReturnType<Fsd3OneShotPreflightService['runAuthorizedReadOnlyPreflight']>>;
  }>;
};

function assertPreflightIdentityStable(
  label: string,
  expected: string | null,
  actual: string | null,
): void {
  if (expected == null || actual == null || expected !== actual) {
    throw new Error(`FSD_P6C_PREFLIGHT_IDENTITY_DRIFT_${label}`);
  }
}

@Injectable()
export class FsdP6cFleetDiscoveryService {
  constructor(
    private readonly preflightSvc: Fsd3OneShotPreflightService,
    private readonly fsd3ExecutionSvc: Fsd3OneShotExecutionService,
    private readonly fsd4ExecutionSvc: Fsd4OneShotExecutionService,
    private readonly inspectorSvc: Fsd3DiscoveryRunInspectorService,
  ) {}

  buildOfflinePlanReport(input: {
    manifest: FsdP6cFleetManifestV1;
    tokenIdByVehicleId: ReadonlyMap<string, number>;
  }) {
    assertFsdP6cFleetManifestOrderV1(input.manifest);
    return buildFsdP6cFleetDiscoveryPlanReportV1(input);
  }

  private buildGoNoGo(input: {
    planReport: ReturnType<typeof buildFsdP6cFleetDiscoveryPlanReportV1>;
    providerBudgetGuard: ReturnType<typeof evaluateFsdP6cProviderBudgetGuardV1>;
    context: FsdP6cGoNoGoContextV1;
    liveProvider: Fsd3OneShotLiveProviderV1;
    productionManifestValid: boolean;
    env: NodeJS.ProcessEnv;
  }) {
    const ownerOk =
      input.liveProvider === 'mock' ?
        false
      : input.env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] === '1';
    return buildFsdP6cLiveTestGoNoGoV1({
      planReport: input.planReport,
      providerBudgetGuard: input.providerBudgetGuard,
      context: input.context,
      liveProvider: input.liveProvider,
      ownerAuthorizationSatisfied: ownerOk,
      productionManifestValid: input.productionManifestValid,
      architectureReviewCleared: resolveFsdP6cArchitectureReviewClearedV1(input.env),
    });
  }

  async runAuthorizedFleetPreflight(input: {
    manifest: FsdP6cFleetManifestV1;
    actorUserId: string;
    liveProvider: Fsd3OneShotLiveProviderV1;
    env?: NodeJS.ProcessEnv;
  }): Promise<FsdP6cFleetDiscoveryPreflightReportV1> {
    const env = input.env ?? process.env;
    assertFsdP6cFleetManifestOrderV1(input.manifest);
    let productionManifestValid = false;
    try {
      assertProductionFleetManifestV1(input.manifest);
      productionManifestValid = true;
    } catch {
      productionManifestValid = false;
    }

    const tokenMap = new Map<string, number>();
    const fingerprintMap = new Map<string, string | null>();
    const vehiclePreflights: FsdP6cFleetDiscoveryPreflightReportV1['vehiclePreflights'] = [];

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
        throw new Error('FSD_P6C_PREFLIGHT_TOKEN_MISSING');
      }
      tokenMap.set(vehicle.vehicleId, preflight.dimoTokenId);
      fingerprintMap.set(vehicle.vehicleId, preflight.connectionIdentityFingerprint);
      vehiclePreflights.push({ label: vehicle.label, vehicleId: vehicle.vehicleId, preflight });
    }

    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest: input.manifest,
      tokenIdByVehicleId: tokenMap,
      allowCatalogPending: false,
    });
    const providerBudgetGuard = evaluateFsdP6cProviderBudgetGuardV1(planReport);
    const goNoGo = this.buildGoNoGo({
      planReport,
      providerBudgetGuard,
      context: 'AUTHORIZED_READ_ONLY_PREFLIGHT',
      liveProvider: input.liveProvider,
      productionManifestValid,
      env,
    });

    for (const row of vehiclePreflights) {
      assertPreflightIdentityStable(
        row.label,
        fingerprintMap.get(row.vehicleId) ?? null,
        row.preflight.connectionIdentityFingerprint,
      );
    }

    return {
      status: 'AUTHORIZED_READ_ONLY_PREFLIGHT',
      planReport,
      providerBudgetGuard,
      goNoGo,
      vehiclePreflights,
    };
  }

  async executeFleetSequentialMock(input: {
    manifest: FsdP6cFleetManifestV1;
    actorUserId: string;
    releaseSha?: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<{
    vehicles: FsdP6cFleetVehicleExecutionRecordV1[];
    planReport: ReturnType<typeof buildFsdP6cFleetDiscoveryPlanReportV1>;
    fleetStopped: boolean;
    stopReason?: string;
  }> {
    const env = input.env ?? process.env;
    assertFsdP6cMockExecuteDatabaseAllowedV1(env);
    assertProductionFleetManifestV1(input.manifest);
    assertFsdP6cFleetManifestOrderV1(input.manifest);

    const budget = resolveP6cCliBudgetFromManifest(input.manifest);
    const records: FsdP6cFleetVehicleExecutionRecordV1[] = [];
    const tokenMap = new Map<string, number>();
    const fingerprintMap = new Map<string, string | null>();

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
      if (preflight.dimoTokenId == null || !preflight.connectionIdentityFingerprint) {
        throw new Error('FSD_P6C_EXEC_TOKEN_MISSING');
      }
      tokenMap.set(vehicle.vehicleId, preflight.dimoTokenId);
      fingerprintMap.set(vehicle.vehicleId, preflight.connectionIdentityFingerprint);
    }

    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest: input.manifest,
      tokenIdByVehicleId: tokenMap,
    });
    assertFsdP6cProviderBudgetGuardV1(planReport);

    let fleetStopped = false;
    let stopReason: string | undefined;

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
      assertPreflightIdentityStable(
        vehicle.label,
        fingerprintMap.get(vehicle.vehicleId) ?? null,
        preflight.connectionIdentityFingerprint,
      );

      const fsd3Provider: Fsd3DiscoveryProviderPortV1 = createFsd3MockDiscoveryProvider({
        mode: 'TESLA_REFERENCE_26',
        catalogSignals: [...vehicle.declaredFieldNames],
      });

      const fsd3 = await this.fsd3ExecutionSvc.executeOneShot({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          discoveryRequestKey: vehicle.discoveryRequestKey,
        },
        preflight,
        liveProvider: 'mock',
        provider: fsd3Provider,
        budget,
        releaseSha: input.releaseSha,
      });

      try {
        assertFsd3TerminalAllowsFsd4ReuseV1(fsd3);
      } catch (err) {
        fleetStopped = true;
        stopReason = err instanceof Error ? err.message : String(err);
        records.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          fsd3RunId: fsd3.runId,
          fsd4RunId: '',
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: 'BLOCKED',
          fsd3Inspector: null,
          fsd4Inspector: null,
          discoveryOutcome: 'INCOMPLETE_DISCOVERY',
          fleetStopped: true,
          stopReason,
        });
        break;
      }

      const fsd4Provider: Fsd4HistoricalDiscoveryProviderPortV1 = createFsd4MockHistoricalProvider({
        mode: 'TESLA_P2E_HISTORICAL',
      });

      const fsd4 = await this.fsd4ExecutionSvc.executeHistoricalOneShot({
        scope: {
          organizationId: input.manifest.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: vehicle.providerSourceLinkId,
          historicalRequestKey: vehicle.historicalRequestKey,
        },
        preflight,
        liveProvider: 'mock',
        provider: fsd4Provider,
        historicalWindow: input.manifest.historicalWindow,
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
        records.push({
          label: vehicle.label,
          vehicleId: vehicle.vehicleId,
          fsd3RunId: fsd3.runId,
          fsd4RunId: fsd4.runId,
          fsd3TerminalStatus: fsd3.terminalStatus,
          fsd4TerminalStatus: fsd4.terminalStatus,
          fsd3Inspector,
          fsd4Inspector,
          discoveryOutcome: classifyFsdP6cVehicleDiscoveryOutcomeV1({
            fsd3TerminalStatus: fsd3.terminalStatus,
            fsd4TerminalStatus: fsd4.terminalStatus,
          }),
          fleetStopped: true,
          stopReason,
        });
        break;
      }

      const discoveryOutcome = classifyFsdP6cVehicleDiscoveryOutcomeV1({
        fsd3TerminalStatus: fsd3.terminalStatus,
        fsd4TerminalStatus: fsd4.terminalStatus,
      });

      records.push({
        label: vehicle.label,
        vehicleId: vehicle.vehicleId,
        fsd3RunId: fsd3.runId,
        fsd4RunId: fsd4.runId,
        fsd3TerminalStatus: fsd3.terminalStatus,
        fsd4TerminalStatus: fsd4.terminalStatus,
        fsd3Inspector,
        fsd4Inspector,
        discoveryOutcome,
        fleetStopped: false,
      });
    }

    return { vehicles: records, planReport, fleetStopped, stopReason };
  }
}
