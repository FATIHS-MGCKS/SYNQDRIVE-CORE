import type { ProductSlug } from '@prisma/client';
import type { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import type {
  MaintenanceConflict,
  MaintenancePositionForecast,
  MaintenanceProvenance,
} from '@modules/vehicle-intelligence/service-compliance/maintenance-forecast/maintenance-forecast.types';
import type {
  NextServiceComplianceDto,
  ServiceNextSource,
  ServiceTrackingStatus,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import {
  CORE_SERVICE_INTELLIGENCE_POSITION_CAP,
  CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION,
  type CoreServiceComputedComparisonV1,
  type CoreServiceFreshnessV1,
  type CoreServiceIntelligenceReadV1,
  type CoreServiceMaintenancePositionV1,
  type CoreServiceNextHeadlineV1,
} from './core-service-intelligence-read.v1.types';

export type ServiceComplianceDetailedForCore = Awaited<
  ReturnType<ServiceComplianceService['evaluateNextServiceDetailed']>
>;

const TRACKING_ALLOWLIST: ReadonlySet<ServiceTrackingStatus> = new Set([
  'TRACKED',
  'NO_TRACKING',
  'STALE',
]);

const SOURCE_ALLOWLIST: ReadonlySet<NonNullable<ServiceNextSource>> = new Set([
  'HM_OEM',
  'COMPUTED_ONEAUTO_SCHEDULE',
  'COMPUTED_MANUAL_INTERVAL',
]);

function normalizeSource(raw: ServiceNextSource | undefined): ServiceNextSource {
  if (raw && SOURCE_ALLOWLIST.has(raw)) return raw;
  return null;
}

function failClosedHeadline(headline: CoreServiceNextHeadlineV1): CoreServiceNextHeadlineV1 {
  return {
    ...headline,
    remainingKm: null,
    remainingDays: null,
    projectedDueDate: null,
    positionKind: null,
    positionId: null,
    computedComparison: null,
  };
}

function mapProvenance(p: MaintenanceProvenance | null | undefined): MaintenanceProvenance | null {
  if (!p) return null;
  return {
    scheduleSource: p.scheduleSource,
    eventSource: p.eventSource,
    odometerSource: p.odometerSource,
    calculationMethod: p.calculationMethod,
  };
}

function mapConflict(conflict: MaintenanceConflict): MaintenanceConflict {
  return {
    code: conflict.code,
    positionId: conflict.positionId,
    hmRemainingKm: conflict.hmRemainingKm,
    computedRemainingKm: conflict.computedRemainingKm,
    hmRemainingDays: conflict.hmRemainingDays,
    computedRemainingDays: conflict.computedRemainingDays,
  };
}

function mapConflicts(conflicts: MaintenanceConflict[] | undefined): MaintenanceConflict[] {
  return (conflicts ?? []).map(mapConflict);
}

function mapComputedComparison(
  raw: NextServiceComplianceDto['computedComparison'],
): CoreServiceComputedComparisonV1 | null {
  if (!raw) return null;
  const source = normalizeSource(raw.source);
  if (source !== 'COMPUTED_ONEAUTO_SCHEDULE' && source !== 'COMPUTED_MANUAL_INTERVAL') {
    return null;
  }
  return {
    source,
    positionId: raw.positionId,
    remainingKm: raw.remainingKm,
    remainingDays: raw.remainingDays,
    projectedDueDate: raw.projectedDueDate,
  };
}

function mapHeadline(nextService: NextServiceComplianceDto): CoreServiceNextHeadlineV1 {
  const trackingUnknown =
    nextService.trackingStatus == null ||
    !TRACKING_ALLOWLIST.has(nextService.trackingStatus);
  const sourceUnknown =
    nextService.source != null && !SOURCE_ALLOWLIST.has(nextService.source);

  if (trackingUnknown || sourceUnknown) {
    return {
      trackingStatus: 'NO_TRACKING',
      source: null,
      remainingKm: null,
      remainingDays: null,
      projectedDueDate: null,
      positionKind: null,
      positionId: null,
      severity: 'INFO',
      provenance: null,
      headlineDataQuality: [],
      computedComparison: null,
    };
  }

  const trackingStatus = nextService.trackingStatus;
  const source = nextService.source;

  let headline: CoreServiceNextHeadlineV1 = {
    trackingStatus,
    source,
    remainingKm: nextService.distanceToNextServiceKm,
    remainingDays: nextService.timeToNextServiceDays,
    projectedDueDate: nextService.projectedDueDate ?? null,
    positionKind: nextService.positionKind ?? null,
    positionId: nextService.positionId ?? null,
    severity: nextService.severity,
    provenance: mapProvenance(nextService.provenance),
    headlineDataQuality: nextService.dataQuality ?? [],
    computedComparison: mapComputedComparison(nextService.computedComparison),
  };

  if (trackingStatus === 'STALE' || trackingStatus === 'NO_TRACKING') {
    headline = failClosedHeadline(headline);
    headline.trackingStatus = trackingStatus;
    headline.source = source;
    headline.severity = nextService.severity;
    headline.provenance = mapProvenance(nextService.provenance);
    headline.headlineDataQuality = nextService.dataQuality ?? [];
  }

  return headline;
}

function mapPosition(position: MaintenancePositionForecast): CoreServiceMaintenancePositionV1 {
  return {
    positionId: position.positionId,
    kind: position.kind,
    dueState: position.dueState,
    severity: position.severity,
    intervalMode: position.intervalMode,
    intervalKm: position.intervalKm,
    intervalMonths: position.intervalMonths,
    dueAtKm: position.dueAtKm,
    dueAtDate: position.dueAtDate,
    remainingKm: position.remainingKm,
    remainingDays: position.remainingDays,
    remainingMonths: position.remainingMonths,
    computationMode: position.computationMode,
    provenance: mapProvenance(position.provenance)!,
    dataQuality: position.dataQuality,
  };
}

function emptyFreshness(): CoreServiceFreshnessV1 {
  return {
    odometerObservedAt: null,
    scheduleFetchedAt: null,
    hmLastUpdatedAt: null,
    latestEventDate: null,
  };
}

export function toCoreServiceIntelligenceReadV1(input: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  detailed: ServiceComplianceDetailedForCore;
}): CoreServiceIntelligenceReadV1 {
  const { nextService, forecast } = input.detailed;
  const conflictSource = forecast ? forecast.conflicts : nextService.conflicts;
  const conflicts = mapConflicts(conflictSource);

  if (!forecast) {
    return {
      version: CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      productSlug: input.productSlug,
      nextServiceHeadline: mapHeadline(nextService),
      maintenancePositions: [],
      positionsTotal: 0,
      positionsTruncated: false,
      forecastComputedAt: null,
      freshness: emptyFreshness(),
      forecastDataQuality: [],
      conflicts,
    };
  }

  const positionsTotal = forecast.positions.length;
  const positionsTruncated = positionsTotal > CORE_SERVICE_INTELLIGENCE_POSITION_CAP;
  const maintenancePositions = forecast.positions
    .slice(0, CORE_SERVICE_INTELLIGENCE_POSITION_CAP)
    .map(mapPosition);

  return {
    version: CORE_SERVICE_INTELLIGENCE_READ_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    productSlug: input.productSlug,
    nextServiceHeadline: mapHeadline(nextService),
    maintenancePositions,
    positionsTotal,
    positionsTruncated,
    forecastComputedAt: forecast.computedAt,
    freshness: {
      odometerObservedAt: forecast.freshness.odometerObservedAt,
      scheduleFetchedAt: forecast.freshness.scheduleFetchedAt,
      hmLastUpdatedAt: forecast.freshness.hmLastUpdatedAt,
      latestEventDate: forecast.freshness.latestEventDate,
    },
    forecastDataQuality: forecast.dataQuality,
    conflicts,
  };
}
