import { Injectable, Logger } from '@nestjs/common';
import { DataAuthorizationSourceType, TaskPriority } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import type { HealthState } from '@modules/rental-health/rental-health.types';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import type {
  ServiceComplianceEvaluation,
  TuvBokraftComplianceDto,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import { TasksService } from '@modules/tasks/tasks.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  assembleVehicleConnectivityRuntimeBundle,
  type ConnectivityRuntimeVehicleRow,
  type OrgAuthorizationRow,
} from '@modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import {
  buildFleetDataCoverage,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveFleetProviderClass,
} from '@modules/vehicles/fleet-data-coverage';
import { resolveTelemetryFreshness } from '@modules/vehicles/telemetry-freshness.resolver';
import type { OverallConnectivityState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import {
  assertAiHealthAccess,
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from '../../execution/ai-execution-context.access';
import type { AiDomainError } from '../../evidence/ai-domain-error.types';
import type { AiDomainQueryOutcome } from '../../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  buildPartialAiDomainQueryOutcome,
  createIntegrationTemporarilyUnavailableError,
  createTimeoutError,
  createVehicleNotFoundError,
} from '../../evidence/ai-domain-error.factory';
import { createObservedAiEvidence } from '../../evidence/ai-evidence.factory';
import type { AiEvidenceConfidence } from '../../evidence/ai-evidence.enums';
import type { AiEvidence } from '../../evidence/ai-evidence.types';
import { buildAiVehicleDisplayName } from '../../vehicle-resolution/ai-vehicle-resolution.hints';
import { AiPrismaVehicleScopeResolver } from '../ai-prisma-vehicle-scope.resolver';
import {
  buildEndpointErrorSlice,
  buildMissingDataSlice,
  mapModuleHealthToDomainSlice,
} from './ai-get-vehicle-health-summary.mapper';
import type {
  AiGetVehicleHealthSummaryData,
  AiGetVehicleHealthSummaryDomains,
  AiHealthDataCoverageSummary,
  AiHealthDomainSlice,
  AiHealthDomainStatus,
  AiGetVehicleHealthSummaryInput,
} from './ai-get-vehicle-health-summary.types';
import { AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL } from './ai-get-vehicle-health-summary.types';

const CONNECTIVITY_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
  licensePlate: true,
  vehicleName: true,
  make: true,
  model: true,
  year: true,
  hardwareType: true,
  fuelType: true,
  dimoVehicleId: true,
  dimoVehicle: { select: { connectionStatus: true, tokenId: true, lastSignal: true } },
  latestState: {
    select: {
      lastSeenAt: true,
      providerFetchedAt: true,
      sourceTimestamp: true,
      providerSource: true,
      providerBindingId: true,
      rawPayloadJson: true,
      latitude: true,
      longitude: true,
      speedKmh: true,
      odometerKm: true,
      fuelLevelRelative: true,
      fuelLevelAbsolute: true,
      evSoc: true,
      obdDtcList: true,
      lastDtcPollAt: true,
      updatedAt: true,
    },
  },
  dataSourceLinks: {
    where: { provider: 'DIMO' },
    orderBy: { activatedAt: 'desc' as const },
    select: {
      id: true,
      sourceType: true,
      sourceSubtype: true,
      isActive: true,
      provider: true,
    },
  },
  providerConsents: {
    where: { provider: 'DIMO' },
    orderBy: { grantedAt: 'desc' as const },
    select: {
      organizationId: true,
      provider: true,
      status: true,
      grantedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  },
  deviceConnectionEpisodes: {
    orderBy: { openedAt: 'desc' as const },
    take: 2,
    select: {
      id: true,
      deviceBindingId: true,
      openedAt: true,
      status: true,
      resolutionMethod: true,
      resolutionEvidenceAt: true,
      resolvedAt: true,
    },
  },
} as const;

interface LoadedVehicleRow {
  id: string;
  organizationId: string;
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  lastTuvDate: Date | null;
  nextTuvDate: Date | null;
  lastBokraftDate: Date | null;
  nextBokraftDate: Date | null;
  lastServiceDate: Date | null;
  lastServiceOdometerKm: number | null;
}

@Injectable()
export class AiGetVehicleHealthSummaryTool {
  private readonly logger = new Logger(AiGetVehicleHealthSummaryTool.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealth: RentalHealthService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly damages: DamagesService,
    private readonly tasks: TasksService,
    private readonly vehicleScopeResolver: AiPrismaVehicleScopeResolver,
  ) {}

  async execute(
    context: AiExecutionContext | null | undefined,
    input: AiGetVehicleHealthSummaryInput,
    nowMs: number = Date.now(),
  ): Promise<AiDomainQueryOutcome<AiGetVehicleHealthSummaryData>> {
    const tenantId = context?.organizationId ?? 'unknown';

    const toolGate = assertAiToolExecutionAllowed(context);
    if (toolGate !== true) {
      return this.blockedOutcome(tenantId, toolGate);
    }

    const healthGate = assertAiHealthAccess(context);
    if (healthGate !== true) {
      return this.blockedOutcome(tenantId, healthGate);
    }

    const verifiedContext = context as AiExecutionContext;
    const vehicleAccess = await resolveAiVehicleAccess(
      verifiedContext,
      { vehicleId: input.vehicleId },
      this.vehicleScopeResolver,
    );
    if ('code' in vehicleAccess) {
      return this.blockedOutcome(tenantId, vehicleAccess);
    }

    const row = await this.loadVehicleRow(
      verifiedContext.organizationId,
      vehicleAccess.vehicleId,
    );
    if (!row) {
      return this.blockedOutcome(
        tenantId,
        createVehicleNotFoundError({
          organizationId: verifiedContext.organizationId,
          entityId: vehicleAccess.vehicleId,
          entityKind: 'vehicle',
          correlationId: verifiedContext.correlationId,
          internalDetail: 'ai.get_vehicle_health_summary.vehicle_not_found',
        }),
      );
    }

    const domainErrors: AiDomainError[] = [];
    let vehicleHealth: VehicleHealth | null = null;
    let rentalHealthError: string | null = null;

    try {
      vehicleHealth = await this.rentalHealth.getVehicleHealth(
        verifiedContext.organizationId,
        row.id,
      );
    } catch (error) {
      rentalHealthError = error instanceof Error ? error.message : String(error);
      const isTimeout = /timeout|ETIMEDOUT|ECONNABORTED/i.test(rentalHealthError);
      domainErrors.push(
        isTimeout
          ? createTimeoutError({
              entityId: row.id,
              entityKind: 'vehicle',
              internalDetail: 'ai.get_vehicle_health_summary.rental_health_timeout',
            })
          : createIntegrationTemporarilyUnavailableError({
              entityId: row.id,
              entityKind: 'vehicle',
              causeCode: 'provider_error',
              internalDetail: 'ai.get_vehicle_health_summary.rental_health_failed',
            }),
      );
      this.logger.warn(
        `RentalHealth failed for vehicle=${row.id}: ${rentalHealthError}`,
      );
    }

    const [
      complianceEval,
      damageStats,
      vehicleTasks,
      connectivityBundle,
      dataCoverageResult,
    ] = await Promise.all([
      this.safeComplianceEval(row),
      this.safeDamageStats(row.id),
      this.safeTasksForVehicle(verifiedContext.organizationId, row.id, domainErrors),
      this.safeConnectivityBundle(row, nowMs),
      this.safeDataCoverage(row, nowMs),
    ]);

    const domains = this.buildDomains({
      vehicleHealth,
      rentalHealthError,
      complianceEval,
      damageStats,
      vehicleTasks,
      connectivityBundle,
    });

    const data = this.buildSummaryData({
      row,
      vehicleHealth,
      domains,
      dataCoverageResult,
      complianceEval,
    });

    const evidence = this.buildEvidence(tenantId, data);
    const warnings = [...new Set([...data.warnings, ...data.reasonCodes.map((c) => `reason:${c}`)])];

    if (domainErrors.length > 0 && vehicleHealth != null) {
      return buildPartialAiDomainQueryOutcome({
        tenantId,
        data,
        evidence,
        errors: domainErrors,
        warnings,
      });
    }

    if (domainErrors.length > 0) {
      return buildAiDomainQueryOutcome<AiGetVehicleHealthSummaryData>({
        tenantId,
        data: null,
        evidence,
        errors: domainErrors,
        warnings,
      });
    }

    return buildAiDomainQueryOutcome({
      tenantId,
      data,
      evidence,
      errors: [],
      warnings,
    });
  }

  private async loadVehicleRow(
    organizationId: string,
    vehicleId: string,
  ): Promise<LoadedVehicleRow | null> {
    return this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
      },
    });
  }

  private async safeComplianceEval(
    row: LoadedVehicleRow,
  ): Promise<ServiceComplianceEvaluation | null> {
    try {
      return await this.serviceCompliance.evaluateCompliance(row.id, {
        lastTuvDate: row.lastTuvDate,
        nextTuvDate: row.nextTuvDate,
        lastBokraftDate: row.lastBokraftDate,
        nextBokraftDate: row.nextBokraftDate,
      });
    } catch (error) {
      this.logger.warn(
        `Service compliance unavailable for vehicle=${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async safeDamageStats(vehicleId: string) {
    try {
      return await this.damages.getStats(vehicleId);
    } catch (error) {
      this.logger.warn(
        `Damage stats unavailable for vehicle=${vehicleId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async safeTasksForVehicle(
    orgId: string,
    vehicleId: string,
    domainErrors: AiDomainError[],
  ) {
    try {
      return await this.tasks.getTasksForVehicle(orgId, vehicleId, { activeOnly: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = /timeout|ETIMEDOUT|ECONNABORTED/i.test(message);
      domainErrors.push(
        isTimeout
          ? createTimeoutError({
              entityId: vehicleId,
              entityKind: 'vehicle',
              internalDetail: 'ai.get_vehicle_health_summary.tasks_timeout',
            })
          : createIntegrationTemporarilyUnavailableError({
              entityId: vehicleId,
              entityKind: 'vehicle',
              causeCode: 'provider_error',
              internalDetail: 'ai.get_vehicle_health_summary.tasks_failed',
            }),
      );
      return { data: [], meta: { limit: 50, nextCursor: null } };
    }
  }

  private async safeConnectivityBundle(row: LoadedVehicleRow, nowMs: number) {
    try {
      const connectivityRow = await this.prisma.vehicle.findFirst({
        where: { id: row.id, organizationId: row.organizationId },
        select: CONNECTIVITY_VEHICLE_SELECT,
      });
      if (!connectivityRow) {
        return null;
      }
      const orgAuthorization = await this.loadOrgAuthorization(row.organizationId);
      return assembleVehicleConnectivityRuntimeBundle(
        connectivityRow as ConnectivityRuntimeVehicleRow,
        orgAuthorization,
        nowMs,
      );
    } catch (error) {
      this.logger.warn(
        `Connectivity bundle unavailable for vehicle=${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async safeDataCoverage(row: LoadedVehicleRow, nowMs: number) {
    try {
      const connectivityRow = await this.prisma.vehicle.findFirst({
        where: { id: row.id, organizationId: row.organizationId },
        select: CONNECTIVITY_VEHICLE_SELECT,
      });
      if (!connectivityRow?.latestState) {
        return null;
      }
      const raw = connectivityRow.latestState.rawPayloadJson as Record<string, unknown> | null;
      const conn = extractConnectivitySnapshot(raw ?? undefined);
      const hasProviderLink =
        (connectivityRow.dimoVehicle?.tokenId ?? 0) > 0 &&
        connectivityRow.dataSourceLinks.some((l) => l.isActive);
      const canonicalTelemetry = resolveTelemetryFreshness(
        {
          providerObservedAt: connectivityRow.latestState.sourceTimestamp,
          lastValidTelemetryAt: connectivityRow.latestState.lastSeenAt,
          receivedAt: connectivityRow.latestState.providerFetchedAt,
          lastSignal: connectivityRow.dimoVehicle?.lastSignal ?? null,
          latestStateUpdatedAt: connectivityRow.latestState.updatedAt,
        },
        nowMs,
      );
      const hasAftermarket = connectivityRow.hardwareType === 'LTE_R1';
      return buildFleetDataCoverage({
        context: {
          provider: resolveFleetProviderClass(
            hasProviderLink,
            connectivityRow.latestState.providerSource,
          ),
          deviceClass: resolveFleetDeviceClass({
            hardwareType: connectivityRow.hardwareType,
            hasAftermarketDevice: hasAftermarket,
            hasSyntheticDevice: false,
            hasProviderLink,
          }),
          powertrain: resolveFleetPowertrainClass(connectivityRow.fuelType),
          physicalObdCapable: connectivityRow.hardwareType === 'LTE_R1',
          hasProviderLink,
          hasTelemetrySnapshot: true,
        },
        observation: {
          latitude: connectivityRow.latestState.latitude,
          longitude: connectivityRow.latestState.longitude,
          odometerKm: connectivityRow.latestState.odometerKm,
          speedKmh: connectivityRow.latestState.speedKmh,
          fuelLevelRelative: connectivityRow.latestState.fuelLevelRelative,
          fuelLevelAbsolute: connectivityRow.latestState.fuelLevelAbsolute,
          evSoc: connectivityRow.latestState.evSoc,
          obdDtcList: connectivityRow.latestState.obdDtcList,
          lastDtcPollAt: connectivityRow.latestState.lastDtcPollAt,
          obdIsPluggedIn: conn.obdIsPluggedIn,
          jammingDetectedCount: conn.jammingDetectedCount,
          hasTelemetry: true,
          rawSignals: raw,
        },
        telemetryFreshness: canonicalTelemetry.freshness,
      });
    } catch {
      return null;
    }
  }

  private async loadOrgAuthorization(
    organizationId: string,
  ): Promise<OrgAuthorizationRow | null> {
    return this.prisma.orgDataAuthorization.findFirst({
      where: {
        organizationId,
        sourceType: DataAuthorizationSourceType.DIMO,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
      select: {
        status: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  private buildDomains(input: {
    vehicleHealth: VehicleHealth | null;
    rentalHealthError: string | null;
    complianceEval: ServiceComplianceEvaluation | null;
    damageStats: Awaited<ReturnType<DamagesService['getStats']>> | null;
    vehicleTasks: Awaited<ReturnType<TasksService['getTasksForVehicle']>>;
    connectivityBundle: ReturnType<typeof assembleVehicleConnectivityRuntimeBundle> | null;
  }): AiGetVehicleHealthSummaryDomains {
    if (!input.vehicleHealth) {
      return this.buildDegradedDomains({
        rentalHealthError: input.rentalHealthError,
        complianceEval: input.complianceEval,
        damageStats: input.damageStats,
        vehicleTasks: input.vehicleTasks,
        connectivityBundle: input.connectivityBundle,
      });
    }

    const health = input.vehicleHealth;
    const blockingReasons = health.blocking_reasons;
    const blockingReasonsLower = blockingReasons.map((reason) => reason.toLowerCase());

    const overallSlice = mapModuleHealthToDomainSlice(
      {
        state: health.overall_state,
        reason: this.buildOverallSummaryFacts(health),
        last_updated_at: health.generated_at,
        data_stale: health.availability !== 'ready',
        source: 'rental_health',
        evidence_type: 'unknown' as const,
      },
      {
        blocker: health.rental_blocked === true,
        reasonCodes: [
          ...(health.degradation?.code ? [health.degradation.code] : []),
          ...health.blocking_reasons,
        ],
        warnings:
          health.availability !== 'ready'
            ? ['limited_pipeline_availability']
            : health.overall_state === 'unknown'
              ? ['unknown_overall_despite_modules']
              : [],
      },
    );

    return {
      overall: overallSlice,
      battery: mapModuleHealthToDomainSlice(health.modules.battery, {
        blocker: blockingReasonsLower.some((reason) => reason.includes('batterie')),
      }),
      tires: mapModuleHealthToDomainSlice(health.modules.tires, {
        blocker: blockingReasonsLower.some((reason) => reason.includes('reifen')),
      }),
      brakes: mapModuleHealthToDomainSlice(health.modules.brakes, {
        blocker: blockingReasonsLower.some((reason) => reason.includes('bremsen')),
      }),
      dtcs: this.buildDtcSlice(health.modules.error_codes, blockingReasonsLower),
      warningLights: mapModuleHealthToDomainSlice(health.modules.vehicle_alerts, {
        blocker:
          blockingReasonsLower.some((reason) => reason.includes('limp')) ||
          blockingReasonsLower.some((reason) => reason.includes('motoröl')),
      }),
      connectivity: this.buildConnectivitySlice(input.connectivityBundle),
      service: this.buildServiceSlice(input.complianceEval, blockingReasonsLower),
      tuv: this.buildTuvSlice(input.complianceEval, blockingReasonsLower),
      bokraft: this.buildBokraftSlice(input.complianceEval, blockingReasonsLower),
      damages: this.buildDamagesSlice(input.damageStats),
      technicalObservations: mapModuleHealthToDomainSlice(health.modules.complaints, {
        blocker: blockingReasonsLower.some((reason) =>
          reason.includes('technische beobachtung'),
        ),
      }),
      criticalTasks: this.buildCriticalTasksSlice(input.vehicleTasks),
    };
  }

  private buildDegradedDomains(input: {
    rentalHealthError: string | null;
    complianceEval: ServiceComplianceEvaluation | null;
    damageStats: Awaited<ReturnType<DamagesService['getStats']>> | null;
    vehicleTasks: Awaited<ReturnType<TasksService['getTasksForVehicle']>>;
    connectivityBundle: ReturnType<typeof assembleVehicleConnectivityRuntimeBundle> | null;
  }): AiGetVehicleHealthSummaryDomains {
    const overall = buildEndpointErrorSlice({
      source: 'rental_health',
      message:
        input.rentalHealthError ??
        'Fahrzeug-Gesundheit konnte nicht vollständig geladen werden',
      reasonCodes: ['PIPELINE_UNAVAILABLE'],
    });

    return {
      overall,
      battery: buildMissingDataSlice({
        source: 'rental_health',
        message: 'Batteriedaten nicht verfügbar',
      }),
      tires: buildMissingDataSlice({
        source: 'rental_health',
        message: 'Reifendaten nicht verfügbar',
      }),
      brakes: buildMissingDataSlice({
        source: 'rental_health',
        message: 'Bremsendaten nicht verfügbar',
      }),
      dtcs: buildMissingDataSlice({
        source: 'rental_health',
        message: 'Fehlercode-Daten nicht verfügbar',
      }),
      warningLights: buildMissingDataSlice({
        source: 'rental_health',
        message: 'Warnleuchten nicht verfügbar',
      }),
      connectivity: input.connectivityBundle
        ? this.buildConnectivitySlice(input.connectivityBundle)
        : buildMissingDataSlice({
            source: 'connectivity_runtime',
            message: 'Connectivity-Daten nicht verfügbar',
          }),
      service: input.complianceEval
        ? this.buildServiceSlice(input.complianceEval, [])
        : buildMissingDataSlice({
            source: 'service_compliance',
            message: 'Service-Daten nicht verfügbar',
          }),
      tuv: input.complianceEval
        ? this.buildTuvSlice(input.complianceEval, [])
        : buildMissingDataSlice({
            source: 'service_compliance',
            message: 'TÜV-Daten nicht verfügbar',
          }),
      bokraft: input.complianceEval
        ? this.buildBokraftSlice(input.complianceEval, [])
        : buildMissingDataSlice({
            source: 'service_compliance',
            message: 'BOKraft-Daten nicht verfügbar',
          }),
      damages: this.buildDamagesSlice(input.damageStats),
      technicalObservations: buildMissingDataSlice({
        source: 'complaints',
        message: 'Technische Beobachtungen nicht verfügbar',
      }),
      criticalTasks: this.buildCriticalTasksSlice(input.vehicleTasks),
    };
  }

  private buildOverallSummaryFacts(health: VehicleHealth): string {
    const facts = [
      `overall_state=${health.overall_state}`,
      `pipeline_availability=${health.availability}`,
    ];
    if (health.rental_blocked === true) {
      facts.push('rental_blocked=true');
    } else if (health.rental_blocked === null) {
      facts.push('rental_blocked=indeterminate');
    }
    if (health.blocking_reasons.length > 0) {
      facts.push(`blocking_reasons=${health.blocking_reasons.length}`);
    }
    const unknownModules = Object.entries(health.modules)
      .filter(([, module]) => module.state === 'unknown')
      .map(([key]) => key);
    if (unknownModules.length > 0) {
      facts.push(`modules_with_unknown_data=${unknownModules.join(',')}`);
    }
    return facts.join('; ');
  }

  private buildDtcSlice(
    module: VehicleHealth['modules']['error_codes'],
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    const slice = mapModuleHealthToDomainSlice(module, {
      blocker:
        module.state === 'critical' ||
        blockingReasonsLower.some((reason) => reason.includes('fehlercode')),
      warnings:
        module.state === 'good'
          ? ['no_active_dtcs_does_not_imply_overall_health']
          : module.state === 'unknown'
            ? ['dtc_data_unavailable']
            : [],
    });
    return slice;
  }

  private buildConnectivitySlice(
    bundle: ReturnType<typeof assembleVehicleConnectivityRuntimeBundle> | null,
  ): AiHealthDomainSlice {
    if (!bundle) {
      return buildMissingDataSlice({
        source: 'connectivity_runtime',
        message: 'Connectivity-Daten nicht verfügbar',
      });
    }
    const runtime = bundle.runtime;
    const status = this.mapConnectivityToHealthState(runtime.overallState);
    return mapModuleHealthToDomainSlice(
      {
        state: status,
        reason: `Connectivity ${runtime.overallState}`,
        last_updated_at: runtime.lastTelemetryAt,
        data_stale: runtime.telemetryState === 'offline' || runtime.telemetryState === 'signal_delayed',
        source: 'connectivity_runtime',
        evidence_type: 'provider',
      },
      {
        reasonCodes: runtime.reasonCodes,
        warnings:
          runtime.overallState === 'INTEGRATION_ERROR'
            ? ['provider_outage_suspected']
            : [],
      },
    );
  }

  private mapConnectivityToHealthState(state: OverallConnectivityState): HealthState {
    switch (state) {
      case 'TELEMETRY_ACTIVE':
      case 'STANDBY':
        return 'good';
      case 'SOFT_OFFLINE':
        return 'warning';
      case 'OFFLINE':
      case 'DEVICE_UNPLUGGED':
      case 'AUTHORIZATION_REQUIRED':
      case 'NO_ACTIVE_DATA_SOURCE':
        return 'critical';
      case 'INTEGRATION_ERROR':
        return 'critical';
      case 'UNKNOWN':
      default:
        return 'unknown';
    }
  }

  private buildServiceSlice(
    compliance: ServiceComplianceEvaluation | null,
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    if (!compliance) {
      return buildEndpointErrorSlice({
        source: 'service_compliance',
        message: 'Service-Compliance konnte nicht geladen werden',
      });
    }
    const next = compliance.nextService;
    let state: HealthState = 'unknown';
    if (next.trackingStatus === 'TRACKED') {
      if (next.severity === 'CRITICAL') state = 'critical';
      else if (next.severity === 'WARNING') state = 'warning';
      else state = 'good';
    } else if (next.trackingStatus === 'STALE') {
      state = 'unknown';
    }

    return mapModuleHealthToDomainSlice(
      {
        state,
        reason: next.message || next.title,
        last_updated_at: next.lastUpdatedAt,
        data_stale: next.trackingStatus === 'STALE',
        source: 'service_compliance',
        evidence_type:
          next.source === 'HM_OEM' || next.source === 'COMPUTED_ONEAUTO_SCHEDULE' ? 'provider' : 'manual',
      },
      {
        blocker:
          next.blocksRental ||
          blockingReasonsLower.some((reason) => reason.includes('service')),
        summaryFacts: [
          next.title,
          next.message,
          `trackingStatus=${next.trackingStatus}`,
        ].filter(Boolean),
        warnings: next.trackingStatus === 'NO_TRACKING' ? ['service_not_tracked'] : [],
      },
    );
  }

  private buildTuvSlice(
    compliance: ServiceComplianceEvaluation | null,
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    if (!compliance) {
      return buildEndpointErrorSlice({
        source: 'service_compliance',
        message: 'TÜV-Daten nicht verfügbar',
      });
    }
    return this.buildTuvSliceFromTuvBokraft(compliance.tuvBokraft, blockingReasonsLower);
  }

  private buildBokraftSlice(
    compliance: ServiceComplianceEvaluation | null,
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    if (!compliance) {
      return buildEndpointErrorSlice({
        source: 'service_compliance',
        message: 'BOKraft-Daten nicht verfügbar',
      });
    }
    return this.buildBokraftSliceFromTuvBokraft(compliance.tuvBokraft, blockingReasonsLower);
  }

  private buildTuvSliceFromTuvBokraft(
    tuvBokraft: TuvBokraftComplianceDto,
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    let state: HealthState = 'good';
    if (tuvBokraft.tuvOverdue) {
      state = 'critical';
    } else if (
      tuvBokraft.tuvRemainingDays != null &&
      tuvBokraft.tuvRemainingDays >= 0 &&
      tuvBokraft.tuvRemainingDays <= 30
    ) {
      state = 'warning';
    } else if (tuvBokraft.tuvValidTill == null && tuvBokraft.tuvLastDate == null) {
      state = 'unknown';
    }

    const facts: string[] = [];
    if (tuvBokraft.tuvValidTill) facts.push(`valid_till=${tuvBokraft.tuvValidTill}`);
    if (tuvBokraft.tuvRemainingDays != null) {
      facts.push(`remaining_days=${tuvBokraft.tuvRemainingDays}`);
    }
    if (tuvBokraft.tuvOverdue) facts.push('tuv_overdue=true');

    return mapModuleHealthToDomainSlice(
      {
        state,
        reason:
          state === 'critical'
            ? 'TÜV abgelaufen'
            : state === 'warning'
              ? `TÜV läuft in ${tuvBokraft.tuvRemainingDays} Tagen ab`
              : state === 'unknown'
                ? 'Keine TÜV-Daten hinterlegt'
                : 'TÜV gültig',
        last_updated_at: tuvBokraft.tuvLastDate ?? tuvBokraft.tuvValidTill,
        data_stale: false,
        source: 'service_compliance',
        evidence_type: 'manual',
      },
      {
        blocker:
          tuvBokraft.tuvOverdue ||
          blockingReasonsLower.some((reason) => reason.includes('tüv')),
        summaryFacts: facts,
        warnings: state === 'unknown' ? ['tuv_data_missing'] : [],
      },
    );
  }

  private buildBokraftSliceFromTuvBokraft(
    tuvBokraft: TuvBokraftComplianceDto,
    blockingReasonsLower: string[],
  ): AiHealthDomainSlice {
    let state: HealthState = 'good';
    if (tuvBokraft.bokraftOverdue) {
      state = 'critical';
    } else if (
      tuvBokraft.bokraftRemainingDays != null &&
      tuvBokraft.bokraftRemainingDays >= 0 &&
      tuvBokraft.bokraftRemainingDays <= 30
    ) {
      state = 'warning';
    } else if (tuvBokraft.bokraftValidTill == null && tuvBokraft.bokraftLastDate == null) {
      state = 'unknown';
    }

    const facts: string[] = [];
    if (tuvBokraft.bokraftValidTill) facts.push(`valid_till=${tuvBokraft.bokraftValidTill}`);
    if (tuvBokraft.bokraftRemainingDays != null) {
      facts.push(`remaining_days=${tuvBokraft.bokraftRemainingDays}`);
    }
    if (tuvBokraft.bokraftOverdue) facts.push('bokraft_overdue=true');

    return mapModuleHealthToDomainSlice(
      {
        state,
        reason:
          state === 'critical'
            ? 'BOKraft abgelaufen'
            : state === 'warning'
              ? `BOKraft läuft in ${tuvBokraft.bokraftRemainingDays} Tagen ab`
              : state === 'unknown'
                ? 'Keine BOKraft-Daten hinterlegt'
                : 'BOKraft gültig',
        last_updated_at: tuvBokraft.bokraftLastDate ?? tuvBokraft.bokraftValidTill,
        data_stale: false,
        source: 'service_compliance',
        evidence_type: 'manual',
      },
      {
        blocker:
          tuvBokraft.bokraftOverdue ||
          blockingReasonsLower.some((reason) => reason.includes('bokraft')),
        summaryFacts: facts,
        warnings: state === 'unknown' ? ['bokraft_data_missing'] : [],
      },
    );
  }

  private buildDamagesSlice(
    stats: Awaited<ReturnType<DamagesService['getStats']>> | null,
  ): AiHealthDomainSlice {
    if (!stats) {
      return buildEndpointErrorSlice({
        source: 'damages',
        message: 'Schadensdaten konnten nicht geladen werden',
      });
    }

    let state: HealthState = 'good';
    if (stats.blockingRental > 0 || stats.safetyCritical > 0) {
      state = 'critical';
    } else if (stats.open > 0 || stats.active > 0) {
      state = 'warning';
    }

    return mapModuleHealthToDomainSlice(
      {
        state,
        reason:
          stats.blockingRental > 0
            ? `${stats.blockingRental} vermietungsblockierende Schäden offen`
            : stats.open > 0
              ? `${stats.open} offene Schäden`
              : 'Keine aktiven Schäden',
        last_updated_at: stats.oldestOpenDamageAt,
        data_stale: false,
        source: 'damages',
        evidence_type: 'manual',
      },
      {
        blocker: stats.blockingRental > 0,
        summaryFacts: [
          `open=${stats.open}`,
          `blockingRental=${stats.blockingRental}`,
          `safetyCritical=${stats.safetyCritical}`,
        ],
      },
    );
  }

  private buildCriticalTasksSlice(
    taskPage: Awaited<ReturnType<TasksService['getTasksForVehicle']>>,
  ): AiHealthDomainSlice {
    const tasks = taskPage.data ?? [];
    const blockingTasks = tasks.filter((task) => task.blocksVehicleAvailability === true);
    const criticalPriority = tasks.filter(
      (task) =>
        task.priority === TaskPriority.CRITICAL ||
        task.priority === TaskPriority.HIGH,
    );

    let state: HealthState = 'good';
    if (blockingTasks.length > 0) {
      state = 'critical';
    } else if (criticalPriority.length > 0) {
      state = 'warning';
    }

    const summaryFacts = [
      ...blockingTasks.map((task) => `blocker_task:${task.title}`),
      ...criticalPriority
        .filter((task) => !task.blocksVehicleAvailability)
        .map((task) => `critical_task:${task.title}`),
    ].slice(0, 8);

    const latestTask = tasks.reduce<string | null>((latest, task) => {
      const updated = task.updatedAt ?? task.createdAt;
      if (!updated) return latest;
      if (!latest || Date.parse(updated) > Date.parse(latest)) return updated;
      return latest;
    }, null);

    return mapModuleHealthToDomainSlice(
      {
        state,
        reason:
          blockingTasks.length > 0
            ? `${blockingTasks.length} verfügbarkeitsblockierende Aufgaben offen`
            : criticalPriority.length > 0
              ? `${criticalPriority.length} kritische Aufgaben offen`
              : 'Keine kritischen Aufgaben',
        last_updated_at: latestTask,
        data_stale: false,
        source: 'tasks',
        evidence_type: 'manual',
      },
      {
        blocker: blockingTasks.length > 0,
        summaryFacts,
      },
    );
  }

  private buildSummaryData(input: {
    row: LoadedVehicleRow;
    vehicleHealth: VehicleHealth | null;
    domains: AiGetVehicleHealthSummaryDomains;
    dataCoverageResult: Awaited<ReturnType<typeof buildFleetDataCoverage>> | null;
    complianceEval: ServiceComplianceEvaluation | null;
  }): AiGetVehicleHealthSummaryData {
    const health = input.vehicleHealth;
    const limitedData =
      health?.availability !== 'ready' ||
      Object.values(input.domains).some(
        (slice) =>
          slice.availability === 'unavailable' ||
          slice.availability === 'partial' ||
          slice.status === 'unknown',
      );

    const dataCoverage: AiHealthDataCoverageSummary = input.dataCoverageResult
      ? {
          coverageState: input.dataCoverageResult.coverageState,
          coveragePercent: input.dataCoverageResult.coveragePercent,
          expectedSignalCount: input.dataCoverageResult.expectedSignalCount,
          freshSignalCount: input.dataCoverageResult.freshSignalCount,
          staleSignalCount: input.dataCoverageResult.staleSignalCount,
          missingSignalCount: input.dataCoverageResult.missingSignalCount,
        }
      : {
          coverageState: health?.availability ?? 'unavailable',
          coveragePercent: null,
          expectedSignalCount: 0,
          freshSignalCount: 0,
          staleSignalCount: 0,
          missingSignalCount: 0,
        };

    const confidence = this.resolveOverallConfidence(input.domains, health);
    const reasonCodes = [
      ...new Set([
        ...(health?.blocking_reasons ?? []),
        ...(health?.degradation?.code ? [health.degradation.code] : []),
        ...Object.values(input.domains).flatMap((d) => d.reasonCodes),
      ]),
    ];

    const warnings = [
      ...new Set([
        ...(limitedData ? ['limited_data_coverage'] : []),
        ...Object.values(input.domains).flatMap((d) => d.warnings),
      ]),
    ];

    return {
      vehicleId: input.row.id,
      displayName: buildAiVehicleDisplayName(input.row),
      licensePlate: input.row.licensePlate,
      overallStatus: health?.overall_state ?? 'unknown',
      pipelineAvailability: health?.availability ?? 'unavailable',
      limitedData,
      dataCoverage,
      confidence,
      lastUpdatedAt: health?.generated_at ?? new Date().toISOString(),
      rentalBlocked: health?.rental_blocked ?? null,
      readyToRentBlockers: health?.blocking_reasons ?? [],
      domains: input.domains,
      warnings,
      reasonCodes,
    };
  }

  private resolveOverallConfidence(
    domains: AiGetVehicleHealthSummaryDomains,
    health: VehicleHealth | null,
  ): AiEvidenceConfidence {
    if (!health || health.availability === 'unavailable') {
      return 'unknown';
    }
    if (health.availability === 'partial') {
      return 'low';
    }
    const slices = Object.values(domains);
    if (slices.some((slice) => slice.confidence === 'unknown')) {
      return 'low';
    }
    if (health.overall_state === 'critical') {
      return 'medium';
    }
    if (health.overall_state === 'unknown') {
      return 'low';
    }
    if (slices.some((slice) => slice.confidence === 'low')) {
      return 'low';
    }
    if (slices.some((slice) => slice.confidence === 'medium')) {
      return 'medium';
    }
    return 'high';
  }

  private buildEvidence(tenantId: string, data: AiGetVehicleHealthSummaryData): AiEvidence[] {
    return [
      createObservedAiEvidence({
        tenantId,
        entityId: data.vehicleId,
        source: 'rental_health_service',
        sourceEntity: { kind: 'vehicle', id: data.vehicleId },
        observedAt: data.lastUpdatedAt,
        freshness: data.limitedData ? 'signal_delayed' : 'live',
        confidence: data.confidence,
        availability: data.pipelineAvailability === 'ready' ? 'available' : 'partial',
        reasonCode: data.overallStatus === 'good' ? 'ok' : 'stale_data',
        sensitivity: 'internal',
        warnings: data.warnings,
        value: {
          overallStatus: data.overallStatus,
          rentalBlocked: data.rentalBlocked,
          readyToRentBlockers: data.readyToRentBlockers,
          limitedData: data.limitedData,
          domains: Object.fromEntries(
            Object.entries(data.domains).map(([key, slice]) => [
              key,
              {
                status: slice.status,
                severity: slice.severity,
                blocker: slice.blocker,
                summaryFacts: slice.summaryFacts,
              },
            ]),
          ),
        },
      }),
    ];
  }

  private blockedOutcome(
    tenantId: string,
    error: AiDomainError,
  ): AiDomainQueryOutcome<AiGetVehicleHealthSummaryData> {
    return buildAiDomainQueryOutcome<AiGetVehicleHealthSummaryData>({
      tenantId,
      data: null,
      evidence: [],
      errors: [error],
      warnings: [`${AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL}:blocked`],
    });
  }
}
