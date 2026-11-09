import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CanonicalBatteryHealthService } from '../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { mapRentalBatteryModule } from '../vehicle-intelligence/battery-health/canonical-battery';
import {
  buildBatteryReadinessInputFromSummary,
  evaluateBatteryReadiness,
  hasActiveBatterySafetyDtc,
  isBatteryBlockWorthy,
} from '../vehicle-intelligence/battery-health/battery-readiness.policy';
import { TireHealthService, TireHealthSummary } from '../vehicle-intelligence/tires/tire-health.service';
import { TireHealthObservabilityService } from '../vehicle-intelligence/tires/tire-health-observability.service';
import { BrakeHealthService, BrakeHealthSummaryDto } from '../vehicle-intelligence/brakes/brake-health.service';
import { BrakeHealthObservabilityService } from '../vehicle-intelligence/brakes/brake-health-observability.service';
import { FleetHealthObservabilityService } from '@modules/fleet-health-observability/fleet-health-observability.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import type { ServiceComplianceEvaluation } from '../vehicle-intelligence/service-compliance/service-compliance.types';
import { ServiceComplianceService } from '../vehicle-intelligence/service-compliance/service-compliance.service';
import { evaluateServiceComplianceRentalBlocking } from '../vehicle-intelligence/service-compliance/service-compliance-rental-blocking.policy';
import {
  buildDamageRentalBlockingReasons,
  buildRentalBlockingDamagesWhere,
} from './damage-rental-health.policy';
import {
  dtcBandToHealthState,
  isSafetyCriticalDtcBand,
  type DtcSeverityBand,
} from '../vehicle-intelligence/dtc/dtc-severity.util';
import {
  HealthState,
  ModuleHealth,
  VehicleHealth,
  computeOverallState,
  finalizeVehicleHealthAvailability,
  maxSeverity,
  isStale,
  resolveRentalBlockedState,
  deriveRentalReadiness,
  toIso,
  type RentalHealthModuleKey,
} from './rental-health.types';
import {
  buildTireModuleHealth,
  isTireRentalHardBlocked,
} from './tire-rental-health.policy';
import { TireRentalHealthReviewService } from './tire-rental-health-review.service';
import type { TireRentalHealthModuleHealth } from './tire-rental-health.types';
import {
  buildBrakeModuleHealth,
  isBrakeRentalHardBlocked,
} from './brake-rental-health.policy';
import { BrakeRentalHealthReviewService } from './brake-rental-health-review.service';
import { VehicleHealthWorkflowEmitter } from './vehicle-health-workflow.emitter';
import { DashboardWarningLightsService } from '../vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.service';
import {
  projectVehicleAlertsToRentalHealth,
  vehicleAlertBlockingCausesToReasons,
  type VehicleAlertBlockingCause,
} from '../vehicle-intelligence/dashboard-warning-lights/vehicle-alerts-rental-health.projector';
import type { BrakeRentalHealthModuleHealth } from './brake-rental-health.types';

export type RentalHealthGateStatus = 'OK' | 'BLOCKED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface RentalHealthGateResult {
  blocked: boolean;
  reasons: string[];
  healthGateStatus: RentalHealthGateStatus;
  healthGateWarning: string | null;
  manualReviewRequired: boolean;
}


/**
 * Lifecycle statuses that keep a complaint "open" for rental-health purposes.
 * ACTIVE is the legacy status (≈ OPEN) kept for backwards-compat. IN_REVIEW
 * and CONFIRMED are the new V1 statuses. RESOLVED and REJECTED are ignored.
 */
const OPEN_COMPLAINT_STATUSES = ['ACTIVE', 'OPEN', 'IN_REVIEW', 'CONFIRMED', 'NEW'] as const;

/** Bumped when rental-health response contract or blocking policy changes (VW-F-033). */
export const RENTAL_HEALTH_PROJECTION_VERSION = 'rh-projection-v2';

/**
 * Rental Health V1 — consumption-only aggregation layer.
 *
 * This service NEVER writes back to any health domain. It reads the DTOs
 * that Battery/Tires/Brakes/DTC/Service-Info/HM already produce, applies
 * the canonical Health-State mapping from the V1 spec, combines the seven
 * modules to an overall state and the `rental_blocked` gate.
 *
 * Core contract:
 *   - unknown is NEVER silently promoted to good
 *   - n_a and unknown are strictly distinguished
 *   - every module returns a reason, a timestamp and a data_stale flag
 *   - rental_blocked is an independent boolean, not derived from overall_state
 */
@Injectable()
export class RentalHealthService {
  private readonly logger = new Logger(RentalHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly battery: CanonicalBatteryHealthService,
    private readonly tires: TireHealthService,
    private readonly brakes: BrakeHealthService,
    private readonly dtc: DtcService,
    private readonly hm: HmSignalUsageService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly tireRentalReview: TireRentalHealthReviewService,
    private readonly brakeRentalReview: BrakeRentalHealthReviewService,
    @Optional() private readonly tireObservability?: TireHealthObservabilityService,
    @Optional() private readonly brakeObservability?: BrakeHealthObservabilityService,
    @Optional() private readonly fleetHealthObservability?: FleetHealthObservabilityService,
    @Optional() private readonly healthWorkflowEmitter?: VehicleHealthWorkflowEmitter,
    @Optional() private readonly dashboardWarningLights?: DashboardWarningLightsService,
  ) {}

  /**
   * Compute the full {@link VehicleHealth} for a single vehicle. Throws
   * NotFoundException if the vehicle does not belong to the organization.
   */
  async getVehicleHealth(orgId: string, vehicleId: string): Promise<VehicleHealth> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        fuelType: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found for org ${orgId}`);
    }

    // Fan out module reads in parallel — each module owns its own error
    // budget so a single slow/failing path never pins the whole endpoint.
    const [
      batteryRes,
      tiresRes,
      brakesRes,
      dtcRes,
      hmAiRes,
      tireReviewOverrideRes,
      brakeReviewOverrideRes,
      currentOdoRes,
      complaintsRes,
      complianceRes,
      damagesRes,
      dashboardLightsRes,
    ] = await Promise.allSettled([
      this.battery.getSummary(vehicleId),
      this.hm.getTirePressureSignals(vehicleId).then((hmTirePressure) =>
        this.tires.getSummary(vehicleId, { hmTirePressure }),
      ),
      this.brakes.getSummary(vehicleId),
      this.dtc.getSummary(vehicleId),
      this.hm.getAiHealthCareSignals(vehicleId).catch(() => null),
      this.tireRentalReview.findActiveOverride(orgId, vehicleId),
      this.brakeRentalReview.findActiveOverride(orgId, vehicleId),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true },
      }),
      this.prisma.vehicleComplaint.findMany({
        where: {
          vehicleId,
          organizationId: orgId,
          status: { in: OPEN_COMPLAINT_STATUSES as any },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.serviceCompliance.evaluateCompliance(vehicleId, {
        lastTuvDate: vehicle.lastTuvDate,
        nextTuvDate: vehicle.nextTuvDate,
        lastBokraftDate: vehicle.lastBokraftDate,
        nextBokraftDate: vehicle.nextBokraftDate,
      }),
      this.prisma.vehicleDamage.findMany({
        where: buildRentalBlockingDamagesWhere(orgId, vehicleId),
        select: { id: true, description: true, rentalImpact: true },
        take: 10,
      }),
      this.dashboardWarningLights
        ? this.dashboardWarningLights.getDashboardWarningLights(vehicleId)
        : Promise.reject(new Error('DashboardWarningLightsService not configured')),
    ]);

    const batterySummary = unwrap(batteryRes);
    const tireSummary = unwrap(tiresRes) as TireHealthSummary | null;
    const tireReviewOverride = unwrap(tireReviewOverrideRes);
    const brakeReviewOverride = unwrap(brakeReviewOverrideRes);
    const brakesLoadError =
      brakesRes.status === 'rejected'
        ? (brakesRes.reason as Error)?.message ?? 'Brake health unavailable'
        : null;
    const brakeSummary =
      brakesRes.status === 'fulfilled'
        ? (brakesRes.value as BrakeHealthSummaryDto)
        : null;
    const dtcSummary = unwrap(dtcRes);
    const hmAi = unwrap(hmAiRes);
    const complaintsLoaded = complaintsRes.status === 'fulfilled';
    const openComplaints = complaintsLoaded ? (unwrap(complaintsRes) ?? []) : [];
    const complianceEval = unwrap(complianceRes);
    const rentalBlockingDamages =
      damagesRes.status === 'fulfilled' ? (damagesRes.value ?? []) : [];
    const vehicleAlertsPipelineFailed =
      dashboardLightsRes.status === 'rejected' ||
      (dashboardLightsRes.status === 'fulfilled' &&
        (dashboardLightsRes.value.connectionStatus === 'provider_error' ||
          dashboardLightsRes.value.freshness === 'error'));
    const vehicleAlertsProjection = projectVehicleAlertsToRentalHealth(
      dashboardLightsRes.status === 'fulfilled' ? dashboardLightsRes.value : null,
      { loadFailed: vehicleAlertsPipelineFailed },
    );
    const serviceComplianceModule = complianceEval
      ? this.serviceCompliance.toRentalModuleHealth(
          complianceEval,
          vehicle.lastServiceDate,
          vehicle.nextTuvDate,
          vehicle.nextBokraftDate,
          vehicle.lastTuvDate,
          vehicle.lastBokraftDate,
        )
      : {
          state: 'unknown' as const,
          reason: 'Service-Compliance konnte nicht geladen werden',
          last_updated_at: null,
          data_stale: true,
          source: 'service_compliance',
          evidence_type: 'unknown' as const,
        };

    const modules = {
      battery: this.evaluateBattery(batterySummary, hmAi, dtcSummary),
      tires: this.evaluateTires(tireSummary, tireReviewOverride),
      brakes: this.evaluateBrakes(brakeSummary, {
        moduleLoadError: brakesLoadError,
        activeReviewOverride: brakeReviewOverride,
      }),
      error_codes: this.evaluateErrorCodes(dtcSummary),
      service_compliance: {
        ...serviceComplianceModule,
        source: 'service_compliance',
        evidence_type: this.serviceComplianceEvidenceType(complianceEval),
      },
      complaints: this.evaluateComplaints(openComplaints, complaintsLoaded),
      vehicle_alerts: vehicleAlertsProjection.moduleHealth,
    } as const;

    const moduleLoadFailures: Partial<Record<RentalHealthModuleKey, boolean>> = {
      battery: batteryRes.status === 'rejected',
      tires: tiresRes.status === 'rejected',
      brakes: brakesRes.status === 'rejected' || brakesLoadError != null,
      error_codes: dtcRes.status === 'rejected',
      service_compliance: complianceRes.status === 'rejected',
      complaints: !complaintsLoaded,
      vehicle_alerts: vehicleAlertsPipelineFailed,
    };
    const { modules: modulesWithAvailability, availability } =
      finalizeVehicleHealthAvailability(modules, moduleLoadFailures);

    const overall_state = computeOverallState(Object.values(modulesWithAvailability));
    const blocking_reasons = this.collectBlockingReasons(
      modulesWithAvailability,
      openComplaints,
      vehicleAlertsProjection.blockingCauses,
      complianceEval,
      dtcSummary,
      brakeSummary,
      batterySummary,
      rentalBlockingDamages,
      hmAi,
    );

    const evaluatedAt = new Date().toISOString();
    const rental_blocked = resolveRentalBlockedState(availability, blocking_reasons);
    const rental_readiness = deriveRentalReadiness(availability, rental_blocked);

    const health: VehicleHealth = {
      vehicle_id: vehicleId,
      organization_id: orgId,
      overall_state,
      availability,
      rental_blocked,
      blocking_reasons,
      modules: modulesWithAvailability,
      generated_at: evaluatedAt,
      evaluated_at: evaluatedAt,
      rental_readiness,
      projection_version: RENTAL_HEALTH_PROJECTION_VERSION,
      ...(dashboardLightsRes.status === 'fulfilled'
        ? { dashboard_warning_lights: dashboardLightsRes.value }
        : {}),
    };

    this.fleetHealthObservability?.recordVehicleHealth(health);
    this.healthWorkflowEmitter?.emitIfRentalHealthBandChanged(health);
    return health;
  }

  /**
   * Lean check for the bookings gate. Resolves `true` iff the vehicle is
   * currently rental-blocked. Internally reuses {@link getVehicleHealth}
   * — we deliberately do not expose a side-door that could drift from
   * the UI signal, so UI and gate always agree on "why blocked".
   */
  async isRentalBlocked(
    orgId: string,
    vehicleId: string,
  ): Promise<RentalHealthGateResult> {
    try {
      const health = await this.getVehicleHealth(orgId, vehicleId);
      if (health.availability !== 'ready' || health.rental_blocked === null) {
        return {
          blocked: true,
          reasons: [
            health.degradation?.message ??
              'Fahrzeug-Gesundheit konnte nicht vollständig geprüft werden',
          ],
          healthGateStatus: 'UNAVAILABLE',
          healthGateWarning:
            'Fahrzeug-Gesundheit konnte nicht vollständig geprüft werden. Manuelle Bestätigung erforderlich.',
          manualReviewRequired: true,
        };
      }
      if (health.rental_blocked) {
        return {
          blocked: true,
          reasons: health.blocking_reasons,
          healthGateStatus: 'BLOCKED',
          healthGateWarning: null,
          manualReviewRequired: false,
        };
      }
      return {
        blocked: false,
        reasons: [],
        healthGateStatus: 'OK',
        healthGateWarning: null,
        manualReviewRequired: false,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(
        `Rental-health gate unavailable for ${vehicleId}: ${message}`,
      );
      return {
        blocked: true,
        reasons: ['Fahrzeug-Gesundheit konnte nicht geprüft werden'],
        healthGateStatus: 'UNAVAILABLE',
        healthGateWarning:
          'Fahrzeug-Gesundheit konnte nicht vollständig geprüft werden. Manuelle Bestätigung erforderlich.',
        manualReviewRequired: true,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Module evaluators — one per VehicleHealth.modules key
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Battery — reads the canonical LV battery status from
   * {@link CanonicalBatteryHealthService.getSummary}. This module no longer
   * re-derives a state from the raw voltage (which could be a charging
   * voltage); it consumes the aggregated `lv.healthStatus` (Estimated Battery
   * Health + battery-spec resting-voltage bands) so there is a single source
   * of truth. The HM battery warning light still escalates to at least
   * warning when streamed.
   */
  private evaluateBattery(
    summary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
    hmAi: any | null,
    dtcSummary: Awaited<ReturnType<DtcService['getSummary']>> | null,
  ): ModuleHealth {
    const warningLightActive = readBatteryWarningLight(hmAi);
    const batterySafetyDtcActive = hasActiveBatterySafetyDtc(
      dtcSummary?.activeFaultPreview,
    );
    const readinessInput = buildBatteryReadinessInputFromSummary({
      summary,
      warningLightActive,
      batterySafetyDtcActive,
    });
    const readiness = evaluateBatteryReadiness(readinessInput);

    return mapRentalBatteryModule({
      summary,
      warningLightActive,
      readiness,
    });
  }

  /**
   * Tires — evidence-aware policy via {@link buildTireModuleHealth}.
   * Estimated tread never hard-blocks; measured tread ≤ legal minimum does.
   */
  private evaluateTires(
    summary: TireHealthSummary | null,
    activeReviewOverride: import('./tire-rental-health.types').TireRentalReviewOverrideSummary | null,
  ): TireRentalHealthModuleHealth {
    const moduleHealth = buildTireModuleHealth({
      summary,
      activeReviewOverride,
    });
    const block = moduleHealth.tire_read_model?.rentalBlockingEvidence;
    if (block) {
      this.tireObservability?.recordRentalBlock({
        level: block.action,
        reasonCode: block.reasonCode,
      });
    }
    return moduleHealth;
  }

  /**
   * Brakes — evidence-aware policy via {@link buildBrakeModuleHealth}.
   * Wear, safety, and data quality are evaluated separately; hard blocks
   * require measured wear or active safety evidence.
   */
  private evaluateBrakes(
    summary: BrakeHealthSummaryDto | null,
    options?: {
      moduleLoadError?: string | null;
      activeReviewOverride?: import('./brake-rental-health.types').BrakeRentalReviewOverrideSummary | null;
    },
  ): BrakeRentalHealthModuleHealth {
    const moduleHealth = buildBrakeModuleHealth({
      summary,
      moduleLoadError: options?.moduleLoadError ?? null,
      activeReviewOverride: options?.activeReviewOverride ?? null,
    });
    const block = moduleHealth.brake_read_model?.rentalBlockingEvidence;
    if (block) {
      this.brakeObservability?.recordRentalBlock({
        level: block.action,
        reasonCode: block.reasonCode,
      });
    }
    return moduleHealth;
  }

  /**
   * Error Codes — reads {@link DtcService.getSummary}. Active faults use
   * normalized severity bands; safety-critical bands block rental.
   */
  private evaluateErrorCodes(
    summary: Awaited<ReturnType<DtcService['getSummary']>> | null,
  ): ModuleHealth {
    if (!summary) {
      return {
        state: 'unknown',
        reason: 'Keine DTC-Daten verfügbar',
        last_updated_at: null,
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    const lastAt = summary.lastSuccessfulCheckAt ?? summary.lastCheckedAt ?? null;

    if (summary.status === 'unavailable') {
      return {
        state: 'unknown',
        reason: 'Noch keine DTC-Prüfung durchgeführt',
        last_updated_at: toIso(lastAt),
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    if (summary.status === 'stale') {
      return {
        state: 'unknown',
        reason: 'DTC-Status veraltet',
        last_updated_at: toIso(lastAt),
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    if (summary.status === 'clean') {
      return {
        state: 'good',
        reason: 'Keine aktiven Fehlercodes',
        last_updated_at: toIso(lastAt),
        data_stale: isStale(lastAt),
        source: 'dtc_poll',
        evidence_type: 'provider',
      };
    }

    const worstBand: DtcSeverityBand =
      summary.worstSeverityBand ??
      ('unknown' as DtcSeverityBand);
    const state = dtcBandToHealthState(worstBand);
    const safetyCritical = isSafetyCriticalDtcBand(worstBand);
    const reason = safetyCritical
      ? `${summary.activeFaultCount} aktive Fehlercodes — sicherheitsrelevant`
      : `${summary.activeFaultCount} aktive Fehlercodes`;

    return {
      state,
      reason,
      last_updated_at: toIso(lastAt),
      data_stale: isStale(lastAt),
      source: 'dtc_poll',
      evidence_type: 'provider',
    };
  }

  /**
   * Technical observations (vehicle_complaints) — canonical intake/evidence layer.
   *
   * Module state:
   *   - good: no active observations
   *   - warning: active low/medium/high without blocksRental
   *   - critical: active critical severity OR blocksRental true
   *
   * Rental blocking is handled separately in collectBlockingReasons and only
   * when blocksRental is explicitly true — severity alone never blocks rental.
   */
  private evaluateComplaints(
    complaints: Array<{
      id: string;
      description: string;
      urgency: string;
      status: string;
      impact: string | null;
      blocksRental?: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>,
    loaded: boolean,
  ): ModuleHealth {
    if (!loaded) {
      return {
        state: 'unknown',
        reason: 'Technische Beobachtungen konnten nicht geladen werden',
        last_updated_at: null,
        data_stale: true,
        source: 'complaints',
        evidence_type: 'unknown',
      };
    }

    if (complaints.length === 0) {
      return {
        state: 'good',
        reason: 'Keine aktiven technischen Beobachtungen',
        last_updated_at: null,
        data_stale: false,
        source: 'complaints',
        evidence_type: 'complaint',
      };
    }

    const newest = complaints[0];
    const newestIso = newest.updatedAt.toISOString();

    const critical = complaints.find(
      (c) => c.urgency === 'CRITICAL' || c.blocksRental === true,
    );
    if (critical) {
      return {
        state: 'critical',
        reason: critical.blocksRental
          ? `Vermietungsblockierende Beobachtung vom ${formatDate(critical.createdAt)}`
          : `Kritische technische Beobachtung vom ${formatDate(critical.createdAt)}`,
        last_updated_at: critical.updatedAt.toISOString(),
        data_stale: false,
        source: 'complaints',
        evidence_type: 'complaint',
      };
    }

    return {
      state: 'warning',
      reason:
        complaints.length === 1
          ? `Aktive technische Beobachtung vom ${formatDate(newest.createdAt)}`
          : `${complaints.length} aktive technische Beobachtungen`,
      last_updated_at: newestIso,
      data_stale: false,
      source: 'complaints',
      evidence_type: 'complaint',
    };
  }

  private serviceComplianceEvidenceType(
    evaluation: ServiceComplianceEvaluation | null,
  ): ModuleHealth['evidence_type'] {
    if (!evaluation) return 'unknown';
    const src = evaluation.nextService.source;
    if (evaluation.nextService.trackingStatus === 'TRACKED' && src === 'HM_OEM') return 'provider';
    if (evaluation.nextService.trackingStatus === 'TRACKED' && (src === 'COMPUTED_ONEAUTO_SCHEDULE' || src === 'COMPUTED_MANUAL_INTERVAL')) {
      return 'manual';
    }
    if (
      evaluation.tuvBokraft.tuvValidTill ||
      evaluation.tuvBokraft.bokraftValidTill
    ) {
      return 'manual';
    }
    return 'unknown';
  }

  private isBrakeBlockWorthy(modules: VehicleHealth['modules']): boolean {
    const brakeModule = modules.brakes as BrakeRentalHealthModuleHealth;
    return (
      !!brakeModule.brake_read_model &&
      isBrakeRentalHardBlocked(brakeModule.brake_read_model)
    );
  }

  private isBatteryRentalBlockWorthy(
    summary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
    hmAi: any | null,
    dtcSummary: Awaited<ReturnType<DtcService['getSummary']>> | null,
  ): boolean {
    const readiness = evaluateBatteryReadiness(
      buildBatteryReadinessInputFromSummary({
        summary,
        warningLightActive: readBatteryWarningLight(hmAi),
        batterySafetyDtcActive: hasActiveBatterySafetyDtc(
          dtcSummary?.activeFaultPreview,
        ),
      }),
    );
    return isBatteryBlockWorthy(readiness);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Rental-blocked reasons collector
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vehicle Alerts (OEM) — canonical projection from {@link DashboardWarningLightsService}.
   *
   * Scope (P2.2A): `engine_limp_mode` + `engine_oil_level` only.
   * Brake/tire/battery/MIL remain sibling modules — not interpreted here.
   */
  private collectBlockingReasons(
    modules: VehicleHealth['modules'],
    openComplaints: Array<{ impact: string | null; description?: string; blocksRental?: boolean }>,
    vehicleAlertBlockingCauses: VehicleAlertBlockingCause[],
    complianceEval: ServiceComplianceEvaluation | null,
    dtcSummary: Awaited<ReturnType<DtcService['getSummary']>> | null,
    brakeSummary: BrakeHealthSummaryDto | null,
    batterySummary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
    rentalBlockingDamages: Array<{ description: string | null; rentalImpact: string }> = [],
    hmAi: { limpModeActive: boolean | null; oilLevel: { status: string | null } | null } | null,
  ): string[] {
    const reasons: string[] = [];

    if (complianceEval) {
      const complianceBlocking = evaluateServiceComplianceRentalBlocking(complianceEval);

      if (complianceBlocking.tuvOverdue) {
        const days = complianceEval.tuvBokraft.tuvRemainingDays;
        reasons.push(
          days != null
            ? `TÜV abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`
            : 'TÜV abgelaufen',
        );
      }
      if (complianceBlocking.bokraftOverdue) {
        const days = complianceEval.tuvBokraft.bokraftRemainingDays;
        reasons.push(
          days != null
            ? `BOKraft abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`
            : 'BOKraft abgelaufen',
        );
      }
      if (
        complianceBlocking.serviceOverdueBlocksRental &&
        modules.service_compliance.state === 'critical'
      ) {
        reasons.push(`Service: ${modules.service_compliance.reason}`);
      }
    }

    const rentalBlockingObservation = openComplaints.find((c) => c.blocksRental === true);
    if (rentalBlockingObservation) {
      reasons.push('Technische Beobachtung blockiert Vermietung');
    }

    if (rentalBlockingDamages.length > 0) {
      reasons.push(...buildDamageRentalBlockingReasons(rentalBlockingDamages));
    }

    reasons.push(...vehicleAlertBlockingCausesToReasons(vehicleAlertBlockingCauses));

    if (this.isBrakeBlockWorthy(modules)) {
      const brakeModule = modules.brakes as BrakeRentalHealthModuleHealth;
      const evidence = brakeModule.brake_read_model.rentalBlockingEvidence!;
      reasons.push(`Bremsen: ${evidence.message}`);
    }

    const tireModule = modules.tires as TireRentalHealthModuleHealth;
    if (
      tireModule.tire_read_model &&
      isTireRentalHardBlocked(tireModule.tire_read_model)
    ) {
      const evidence = tireModule.tire_read_model.rentalBlockingEvidence!;
      reasons.push(`Reifen: ${evidence.message}`);
    }

    if (
      this.isBatteryRentalBlockWorthy(batterySummary, hmAi, dtcSummary)
    ) {
      const readiness = evaluateBatteryReadiness(
        buildBatteryReadinessInputFromSummary({
          summary: batterySummary,
          warningLightActive: readBatteryWarningLight(hmAi),
          batterySafetyDtcActive: hasActiveBatterySafetyDtc(
            dtcSummary?.activeFaultPreview,
          ),
        }),
      );
      reasons.push(readiness.reason ?? `Batterie: ${modules.battery.reason}`);
    }

    const dtcBand = dtcSummary?.worstSeverityBand;
    if (
      modules.error_codes.state === 'critical' &&
      (dtcBand ? isSafetyCriticalDtcBand(dtcBand) : true)
    ) {
      reasons.push(`Fehlercodes: ${modules.error_codes.reason}`);
    }

    return reasons;
  }
}

// ── Utility helpers (pure functions) ─────────────────────────────────────────

function unwrap<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === 'fulfilled' ? (r.value as T) : null;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

/**
 * Read the Mercedes-style battery warning light from HM dashboard lights.
 * Returns `true` only if we have a concrete positive signal; all other
 * cases (missing field, unknown OEM) → false so we don't fabricate a
 * warning where none exists.
 */
function readBatteryWarningLight(hmAi: any | null): boolean {
  if (!hmAi?.dashboardLights) return false;
  const raw = hmAi.dashboardLights;
  // dashboardLights can be an array of { name, state } or a map.
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const name = String(entry?.name ?? '').toLowerCase();
      const state = String(entry?.state ?? '').toLowerCase();
      if (
        /battery|batterie/.test(name) &&
        (state === 'on' || state === 'active' || state === 'warning')
      ) {
        return true;
      }
    }
  } else if (typeof raw === 'object') {
    for (const [name, state] of Object.entries(raw)) {
      if (
        /battery|batterie/i.test(name) &&
        /on|active|warning|true|1/i.test(String(state))
      ) {
        return true;
      }
    }
  }
  return false;
}
