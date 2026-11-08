import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import type { HealthState, VehicleHealth } from '@modules/rental-health/rental-health.types';
import { RENTAL_HEALTH_STALE_MS } from '@modules/rental-health/rental-health.types';
import { AiHealthCareAggregationService } from './ai-health-care-aggregation.service';
import { DashboardWarningLightsService } from '../dashboard-warning-lights/dashboard-warning-lights.service';
import type { DashboardWarningLight } from '../dashboard-warning-lights/dashboard-warning-lights.types';
import { ServiceComplianceService } from '../service-compliance/service-compliance.service';
import type { NextServiceComplianceDto, ServiceComplianceEvaluation } from '../service-compliance/service-compliance.types';
import { TUV_BOKRAFT_WARNING_DAYS } from '../service-compliance/service-compliance.config';
import { DtcService } from '../dtc/dtc.service';
import { HmSignalUsageService } from '../../high-mobility/high-mobility-signal-usage.service';
import type {
  VehicleHealthDataQualityLevel,
  VehicleHealthDimoFreshness,
  VehicleHealthFindingSeverity,
  VehicleHealthHmFreshness,
  VehicleHealthModuleState,
  VehicleHealthSummaryState,
  VehicleHealthTabSummaryDto,
  VehicleHealthTargetModalKey,
  ServiceComplianceModuleState,
  VehicleHealthComplianceDateState,
  VehicleHealthModuleStateBase,
} from './vehicle-health-tab-summary.types';

const RENTAL_FINDING_MODULES = [
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'service_compliance',
  'complaints',
  'vehicle_alerts',
] as const;

const MODULE_MODAL: Record<string, VehicleHealthTargetModalKey> = {
  battery: 'battery',
  tires: 'tires',
  brakes: 'brakes',
  error_codes: 'dtc',
  service_compliance: 'service',
  complaints: 'complaints',
  vehicle_alerts: 'warnings',
  oem_hm: 'warnings',
};

const FINDING_TITLES: Record<
  string,
  Partial<Record<'critical' | 'warning' | 'info' | 'unknown', string>>
> = {
  battery: {
    critical: 'Batterie erfordert sofortige Aufmerksamkeit',
    warning: 'Batteriezustand sollte geprüft werden',
    unknown: 'Batterie-Tracking nicht verfügbar',
  },
  tires: {
    critical: 'Reifenzustand kritisch',
    warning: 'Reifenzustand sollte geprüft werden',
    unknown: 'Reifenmessung fehlt',
  },
  brakes: {
    critical: 'Bremsen erfordern sofortige Aufmerksamkeit',
    warning: 'Bremsenzustand sollte geprüft werden',
    unknown: 'Bremsendaten unvollständig',
  },
  error_codes: {
    critical: 'Aktive kritische Fehlercodes erkannt',
    warning: 'Aktive Fehlercodes erkannt',
    unknown: 'Fehlercode-Daten unvollständig',
  },
  service_compliance: {
    critical: 'Service- oder Compliance-Punkt überfällig',
    warning: 'Service oder Compliance bald fällig',
    unknown: 'Service-Compliance unvollständig',
  },
  complaints: {
    critical: 'Offene sicherheitsrelevante Beschwerde',
    warning: 'Offene Beschwerde erfordert Prüfung',
  },
  vehicle_alerts: {
    critical: 'Aktive Fahrzeugwarnung',
    warning: 'Fahrzeugwarnung erkannt',
    unknown: 'Fahrzeugwarnungen unklar',
  },
  oem_hm: {
    critical: 'Aktive OEM-Warnleuchte',
    warning: 'OEM-Warnleuchte aktiv',
    info: 'OEM-Indikator beobachtet',
  },
};

const OVERALL_LABELS: Record<VehicleHealthSummaryState, string> = {
  good: 'Gut',
  warning: 'Warnung',
  critical: 'Kritisch',
  unknown: 'Unbekannt',
};

const DATA_QUALITY_LABELS: Record<VehicleHealthDataQualityLevel, string> = {
  high: 'Hohe Datenqualität',
  medium: 'Mittlere Datenqualität',
  low: 'Niedrige Datenqualität',
  unknown: 'Datenqualität unbekannt',
};

const SEVERITY_ORDER: Record<VehicleHealthFindingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  unknown: 3,
};

/**
 * Canonical Health-tab summary — presentation layer only.
 *
 * Operational status always comes from RentalHealthV1. HM/OEM and AI Health
 * Care supply supplementary indicators and narrative context only.
 */
@Injectable()
export class VehicleHealthTabSummaryService {
  private readonly logger = new Logger(VehicleHealthTabSummaryService.name);

  constructor(
    @Inject(forwardRef(() => RentalHealthService))
    private readonly rentalHealth: RentalHealthService,
    private readonly prisma: PrismaService,
    private readonly aiHealthCare: AiHealthCareAggregationService,
    private readonly dashboardWarningLights: DashboardWarningLightsService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly dtc: DtcService,
    private readonly hm: HmSignalUsageService,
  ) {}

  async getSummary(orgId: string, vehicleId: string): Promise<VehicleHealthTabSummaryDto> {
    const generatedAt = new Date().toISOString();
    const degradedDependencies: VehicleHealthTabSummaryDto['degradedDependencies'] = [];

    let rental: VehicleHealth | null = null;
    let rentalHealthError = false;
    try {
      rental = await this.rentalHealth.getVehicleHealth(orgId, vehicleId);
    } catch (err) {
      rentalHealthError = true;
      this.logger.warn(
        `RentalHealth unavailable for vehicle=${vehicleId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      degradedDependencies.push({
        source: 'rental_health',
        status: 'endpoint_error',
        message: 'Rental Health endpoint unavailable',
      });
    }

    const [aiCare, warningLights, complianceEval, dtcStats, dimoFreshness] = await Promise.all([
      this.safeAiHealthCare(vehicleId, degradedDependencies),
      this.safeDashboardWarningLights(vehicleId),
      this.safeComplianceEval(vehicleId, degradedDependencies),
      this.safeDtcStats(vehicleId),
      this.resolveDimoFreshness(vehicleId),
    ]);
    const hmFreshness = await this.resolveHmFreshness(vehicleId, warningLights);

    const overall = this.buildOverall(rental, rentalHealthError);
    const findings = this.buildFindings(rental, warningLights);
    const moduleStates = this.buildModuleStates(rental, complianceEval);
    const dataQuality = this.computeDataQuality({
      rentalLoaded: !rentalHealthError && rental != null,
      moduleStates,
      hmFreshness,
      dimoFreshness,
      degradedDependencies,
      dtcStale: this.isDtcStale(dtcStats?.lastChecked ?? null),
    });
    const oemIndicators = this.buildOemIndicators(warningLights);
    const nextService = this.buildNextServiceSummary(complianceEval?.nextService ?? null);

    return {
      vehicleId,
      generatedAt,
      overall,
      dataQuality,
      findings,
      moduleStates,
      sourceStatus: {
        rentalHealth: rentalHealthError ? 'endpoint_error' : 'loaded',
        aiHealthCare: degradedDependencies.some((d) => d.source === 'ai_health_care')
          ? 'endpoint_error'
          : aiCare
            ? 'loaded'
            : 'not_available',
        highMobility: hmFreshness,
        dimo: dimoFreshness,
      },
      degradedDependencies,
      oemIndicators,
      nextService,
    };
  }

  private buildOverall(
    rental: VehicleHealth | null,
    rentalHealthError: boolean,
  ): VehicleHealthTabSummaryDto['overall'] {
    if (rentalHealthError || !rental) {
      return {
        state: 'unknown',
        label: OVERALL_LABELS.unknown,
        headline: 'Health status unavailable',
        description:
          'The vehicle health summary could not be calculated because the canonical Rental Health data is unavailable.',
        rentalBlocked: false,
        blockingReasons: [],
      };
    }

    const state = this.mapRentalOverallState(rental.overall_state);
    return {
      state,
      label: OVERALL_LABELS[state],
      headline: this.overallHeadline(state, rental),
      description: this.overallDescription(state, rental),
      rentalBlocked: rental.rental_blocked ?? false,
      blockingReasons: [...rental.blocking_reasons],
    };
  }

  private mapRentalOverallState(state: HealthState): VehicleHealthSummaryState {
    switch (state) {
      case 'good':
        return 'good';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      default:
        return 'unknown';
    }
  }

  private overallHeadline(state: VehicleHealthSummaryState, rental: VehicleHealth): string {
    if (rental.rental_blocked) {
      return 'Vermietung blockiert';
    }
    switch (state) {
      case 'good':
        return 'Fahrzeugzustand ist stabil';
      case 'warning':
        return 'Einige Punkte sollten geprüft werden';
      case 'critical':
        return 'Kritischer Fahrzeugzustand';
      default:
        return 'Gesundheitsstatus unvollständig';
    }
  }

  private overallDescription(state: VehicleHealthSummaryState, rental: VehicleHealth): string {
    if (rental.rental_blocked && rental.blocking_reasons.length > 0) {
      return rental.blocking_reasons.join(' · ');
    }
    switch (state) {
      case 'good':
        return 'Alle überwachten Module melden einen stabilen Zustand.';
      case 'warning':
        return 'Mindestens ein Modul meldet einen Warnzustand.';
      case 'critical':
        return 'Mindestens ein Modul meldet einen kritischen Zustand — zeitnah prüfen.';
      default:
        return 'Für mindestens ein Modul fehlen belastbare Daten.';
    }
  }

  private buildFindings(
    rental: VehicleHealth | null,
    warningLights: Awaited<ReturnType<DashboardWarningLightsService['getDashboardWarningLights']>> | null,
  ): VehicleHealthTabSummaryDto['findings'] {
    const findings: VehicleHealthTabSummaryDto['findings'] = [];

    if (rental) {
      for (const moduleKey of RENTAL_FINDING_MODULES) {
        const mod = rental.modules[moduleKey];
        if (mod.state === 'good' || mod.state === 'n_a') continue;
        const severity = this.moduleStateToFindingSeverity(mod.state);
        findings.push({
          id: `rental-${moduleKey}`,
          module: moduleKey,
          severity,
          title: this.findingTitle(moduleKey, severity),
          description: mod.reason || this.findingTitle(moduleKey, severity),
          evidence: mod.data_stale ? ['Daten möglicherweise veraltet'] : undefined,
          targetModalKey: MODULE_MODAL[moduleKey] ?? null,
        });
      }
    }

    if (warningLights) {
      for (const light of warningLights.lights) {
        if (light.state !== 'active') continue;
        const severity = this.lightSeverityToFinding(light);
        findings.push({
          id: `oem-${light.key}`,
          module: 'oem_hm',
          severity,
          title: light.label,
          description: light.reason || light.action,
          evidence: light.sourceSignal ? [light.sourceSignal] : undefined,
          targetModalKey: 'warnings',
        });
      }
    }

    findings.sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.module.localeCompare(b.module),
    );

    return findings;
  }

  private moduleStateToFindingSeverity(state: HealthState): VehicleHealthFindingSeverity {
    switch (state) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'warning';
      case 'unknown':
        return 'unknown';
      default:
        return 'info';
    }
  }

  private findingTitle(
    module: string,
    severity: VehicleHealthFindingSeverity,
  ): string {
    const titles = FINDING_TITLES[module];
    return (
      titles?.[severity as keyof typeof titles] ??
      titles?.warning ??
      `${module.replace(/_/g, ' ')} — ${severity}`
    );
  }

  private lightSeverityToFinding(light: DashboardWarningLight): VehicleHealthFindingSeverity {
    switch (light.severity) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'unknown';
    }
  }

  private buildModuleStates(
    rental: VehicleHealth | null,
    complianceEval: ServiceComplianceEvaluation | null,
  ): VehicleHealthTabSummaryDto['moduleStates'] {
    const states: VehicleHealthTabSummaryDto['moduleStates'] = {};

    if (rental) {
      for (const [key, mod] of Object.entries(rental.modules)) {
        if (key === 'service_compliance') continue;
        states[key] = {
          state: this.mapModuleState(mod.state, mod.data_stale),
          label: this.moduleStateLabel(mod.state),
          reason: mod.reason || undefined,
        } satisfies VehicleHealthModuleStateBase;
      }
    }

    states.service_compliance = this.buildServiceComplianceModuleState(
      rental?.modules.service_compliance,
      complianceEval,
    );
    return states;
  }

  private buildServiceComplianceModuleState(
    rentalModule: VehicleHealth['modules']['service_compliance'] | undefined,
    evaluation: ServiceComplianceEvaluation | null,
  ): ServiceComplianceModuleState {
    const next = evaluation?.nextService ?? null;
    const tuvBokraft = evaluation?.tuvBokraft ?? null;

    const nextServicePayload = this.buildNextServicePayload(next);
    const tuev = tuvBokraft
      ? {
          dueDate: tuvBokraft.tuvValidTill ?? undefined,
          state: this.complianceDateState(
            tuvBokraft.tuvValidTill,
            tuvBokraft.tuvRemainingDays,
            tuvBokraft.tuvOverdue,
          ),
        }
      : undefined;
    const bokraft = tuvBokraft
      ? {
          dueDate: tuvBokraft.bokraftValidTill ?? undefined,
          state: this.complianceDateState(
            tuvBokraft.bokraftValidTill,
            tuvBokraft.bokraftRemainingDays,
            tuvBokraft.bokraftOverdue,
          ),
        }
      : undefined;

    return {
      state: this.resolveServiceComplianceDisplayState(rentalModule, next),
      label: this.formatNextServiceSummaryLabel(next),
      reason: rentalModule?.reason || next?.message || undefined,
      nextService: nextServicePayload,
      tuev,
      bokraft,
    };
  }

  private buildNextServicePayload(
    next: NextServiceComplianceDto | null,
  ): ServiceComplianceModuleState['nextService'] {
    if (!next || next.trackingStatus !== 'TRACKED') {
      return null;
    }
    const days = next.timeToNextServiceDays ?? undefined;
    const km = next.distanceToNextServiceKm ?? undefined;
    if (days == null && km == null) {
      return null;
    }
    return {
      source: 'hm_oem',
      ...(days != null ? { daysRemaining: days } : {}),
      ...(km != null ? { kmRemaining: km } : {}),
    };
  }

  private resolveServiceComplianceDisplayState(
    rentalModule: VehicleHealth['modules']['service_compliance'] | undefined,
    next: NextServiceComplianceDto | null,
  ): ServiceComplianceModuleState['state'] {
    if (rentalModule?.state === 'critical') return 'critical';
    if (rentalModule?.state === 'warning') return 'warning';

    if (!next || next.trackingStatus === 'NO_TRACKING') {
      return 'no_tracking';
    }
    if (next.trackingStatus === 'STALE') {
      return 'unknown';
    }
    if (next.severity === 'CRITICAL') return 'critical';
    if (next.severity === 'WARNING') return 'warning';
    return 'good';
  }

  private complianceDateState(
    dueDate: string | null,
    remainingDays: number | null,
    overdue: boolean,
  ): VehicleHealthComplianceDateState {
    if (!dueDate) return 'unknown';
    if (overdue) return 'critical';
    if (remainingDays != null && remainingDays >= 0 && remainingDays <= TUV_BOKRAFT_WARNING_DAYS) {
      return 'warning';
    }
    return 'good';
  }

  private formatNextServiceSummaryLabel(next: NextServiceComplianceDto | null): string {
    if (!next || next.trackingStatus === 'NO_TRACKING') {
      return 'Next Service: No Tracking';
    }
    if (next.trackingStatus === 'STALE') {
      return 'Next Service: No Tracking';
    }
    const days = next.timeToNextServiceDays;
    const km = next.distanceToNextServiceKm;
    const hasDays = days != null;
    const hasKm = km != null;
    if (hasDays && hasKm) {
      return `Next Service: ${days} days / ${km} km`;
    }
    if (hasDays) {
      return `Next Service: ${days} days`;
    }
    if (hasKm) {
      return `Next Service: ${km} km`;
    }
    return 'Next Service: No Tracking';
  }

  private moduleStateLabel(state: HealthState): string {
    switch (state) {
      case 'good':
        return 'OK';
      case 'warning':
        return 'Warnung';
      case 'critical':
        return 'Kritisch';
      case 'n_a':
        return 'Nicht anwendbar';
      case 'unknown':
      default:
        return 'Unbekannt';
    }
  }

  private mapModuleState(state: HealthState, dataStale: boolean): VehicleHealthModuleState {
    if (dataStale && state !== 'n_a') return 'stale';
    switch (state) {
      case 'good':
        return 'good';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      case 'n_a':
        return 'not_applicable';
      case 'unknown':
      default:
        return 'unknown';
    }
  }

  private buildNextServiceSummary(
    nextService: NextServiceComplianceDto | null,
  ): VehicleHealthTabSummaryDto['nextService'] {
    if (!nextService) {
      return {
        trackingStatus: 'NO_TRACKING',
        displayLine: 'No Tracking',
        days: null,
        km: null,
      };
    }

    return {
      trackingStatus: nextService.trackingStatus,
      displayLine: this.formatNextServiceLine(nextService),
      days: nextService.timeToNextServiceDays,
      km: nextService.distanceToNextServiceKm,
    };
  }

  private formatNextServiceLine(nextService: NextServiceComplianceDto): string {
    return this.formatNextServiceSummaryLabel(nextService).replace(/^Next Service: /, '');
  }

  private computeDataQuality(input: {
    rentalLoaded: boolean;
    moduleStates: VehicleHealthTabSummaryDto['moduleStates'];
    hmFreshness: VehicleHealthHmFreshness;
    dimoFreshness: VehicleHealthDimoFreshness;
    degradedDependencies: VehicleHealthTabSummaryDto['degradedDependencies'];
    dtcStale: boolean;
  }): VehicleHealthTabSummaryDto['dataQuality'] {
    const reasons: string[] = [];

    if (!input.rentalLoaded) {
      reasons.push('Rental Health endpoint unavailable');
      return {
        level: 'unknown',
        label: DATA_QUALITY_LABELS.unknown,
        reasons,
      };
    }

    const weakModules = Object.entries(input.moduleStates).filter(([, m]) =>
      ['unknown', 'not_applicable', 'no_tracking', 'stale', 'endpoint_error'].includes(m.state),
    );

    if (input.degradedDependencies.some((d) => d.status === 'endpoint_error')) {
      reasons.push('Rental Health endpoint unavailable');
    }
    for (const [key, mod] of weakModules) {
      if (mod.state === 'unknown' && key === 'tires') reasons.push('Tire measurement missing');
      if (mod.state === 'unknown' && key === 'battery') reasons.push('Battery tracking unavailable');
      if (mod.state === 'stale' && key === 'error_codes') reasons.push('DTC data stale');
      if (mod.state === 'no_tracking' && key === 'service_compliance') {
        reasons.push('Next service forecast unavailable (no OEM values and no schedule with proven history)');
      }
    }
    if (input.dtcStale) reasons.push('DTC data stale');
    if (input.hmFreshness === 'not_connected') reasons.push('High Mobility stream not connected');
    if (input.hmFreshness === 'stale') reasons.push('High Mobility data stale');
    if (input.dimoFreshness === 'stale') reasons.push('DIMO telemetry stale');
    if (input.dimoFreshness === 'not_connected') reasons.push('DIMO not connected');

    const endpointErrors = input.degradedDependencies.filter((d) => d.status === 'endpoint_error').length;
    const weakCount = weakModules.length;

    let level: VehicleHealthDataQualityLevel;
    if (endpointErrors > 0) {
      level = 'unknown';
    } else if (
      weakCount <= 1 &&
      input.hmFreshness !== 'stale' &&
      input.dimoFreshness !== 'stale' &&
      !input.dtcStale
    ) {
      level = 'high';
    } else if (weakCount >= 4 || input.hmFreshness === 'stale' || input.dimoFreshness === 'stale') {
      level = 'low';
    } else {
      level = 'medium';
    }

    return {
      level,
      label: DATA_QUALITY_LABELS[level],
      reasons: [...new Set(reasons)],
    };
  }

  private buildOemIndicators(
    warningLights: Awaited<ReturnType<DashboardWarningLightsService['getDashboardWarningLights']>> | null,
  ): VehicleHealthTabSummaryDto['oemIndicators'] {
    if (!warningLights) {
      return {
        supported: false,
        freshness: 'unknown',
        indicators: [],
      };
    }

    const freshness = this.mapDashboardFreshness(warningLights.freshness);
    const supported =
      warningLights.supportStatus === 'supported' ||
      warningLights.connectionStatus === 'connected';

    const indicators = warningLights.lights.map((light) => ({
      key: light.key,
      label: light.label,
      status: this.mapLightStateToIndicatorStatus(light.state),
      severity: this.mapLightSeverity(light.severity),
      description: light.reason || undefined,
    }));

    return { supported, freshness, indicators };
  }

  private mapDashboardFreshness(
    freshness: string,
  ): 'fresh' | 'stale' | 'no_data' | 'unknown' {
    switch (freshness) {
      case 'fresh':
      case 'aging':
        return 'fresh';
      case 'stale':
        return 'stale';
      case 'no_data':
        return 'no_data';
      default:
        return 'unknown';
    }
  }

  private mapLightStateToIndicatorStatus(
    state: DashboardWarningLight['state'],
  ): 'active' | 'inactive' | 'unknown' | 'stale' {
    switch (state) {
      case 'active':
        return 'active';
      case 'off_confirmed':
        return 'inactive';
      case 'stale':
        return 'stale';
      default:
        return 'unknown';
    }
  }

  private mapLightSeverity(
    severity: DashboardWarningLight['severity'],
  ): 'critical' | 'warning' | 'info' | 'unknown' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'unknown';
    }
  }

  private async safeAiHealthCare(
    vehicleId: string,
    degraded: VehicleHealthTabSummaryDto['degradedDependencies'],
  ) {
    try {
      return await this.aiHealthCare.getAiHealthCare(vehicleId);
    } catch (err) {
      degraded.push({
        source: 'ai_health_care',
        status: 'endpoint_error',
        message: 'AI Health Care aggregation unavailable',
      });
      return null;
    }
  }

  private async safeDashboardWarningLights(vehicleId: string) {
    try {
      return await this.dashboardWarningLights.getDashboardWarningLights(vehicleId);
    } catch {
      return null;
    }
  }

  private async safeComplianceEval(
    vehicleId: string,
    degraded: VehicleHealthTabSummaryDto['degradedDependencies'],
  ): Promise<ServiceComplianceEvaluation | null> {
    try {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          nextTuvDate: true,
          nextBokraftDate: true,
          lastTuvDate: true,
          lastBokraftDate: true,
        },
      });
      if (!vehicle) return null;
      return await this.serviceCompliance.evaluateCompliance(vehicleId, {
        lastTuvDate: vehicle.lastTuvDate,
        nextTuvDate: vehicle.nextTuvDate,
        lastBokraftDate: vehicle.lastBokraftDate,
        nextBokraftDate: vehicle.nextBokraftDate,
      });
    } catch {
      degraded.push({
        source: 'service_compliance',
        status: 'endpoint_error',
        message: 'Service compliance unavailable',
      });
      return null;
    }
  }

  private async safeDtcStats(vehicleId: string) {
    try {
      return await this.dtc.getStats(vehicleId);
    } catch {
      return null;
    }
  }

  private isDtcStale(lastChecked: string | Date | null): boolean {
    if (!lastChecked) return true;
    const millis =
      typeof lastChecked === 'string' ? Date.parse(lastChecked) : lastChecked.getTime();
    if (!Number.isFinite(millis)) return true;
    return Date.now() - millis > RENTAL_HEALTH_STALE_MS;
  }

  private async resolveDimoFreshness(vehicleId: string): Promise<VehicleHealthDimoFreshness> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { lastSeenAt: true },
    });

    if (!vehicle?.dimoVehicle?.tokenId) return 'not_connected';
    if (!latest?.lastSeenAt) return 'no_data';

    const age = Date.now() - latest.lastSeenAt.getTime();
    if (age > RENTAL_HEALTH_STALE_MS) return 'stale';
    return 'fresh';
  }

  private async resolveHmFreshness(
    vehicleId: string,
    warningLights: Awaited<ReturnType<DashboardWarningLightsService['getDashboardWarningLights']>> | null,
  ): Promise<VehicleHealthHmFreshness> {
    if (warningLights) {
      if (warningLights.connectionStatus === 'not_connected') return 'not_connected';
      if (warningLights.connectionStatus === 'provider_error') return 'sync_error';
      switch (warningLights.freshness) {
        case 'fresh':
        case 'aging':
          return 'fresh';
        case 'stale':
          return 'stale';
        case 'no_data':
          return 'no_data';
        default:
          break;
      }
    }

    try {
      const active = await this.hm.isHmHealthActive(vehicleId);
      if (!active) return 'not_connected';
      return 'unknown';
    } catch {
      return 'sync_error';
    }
  }
}
