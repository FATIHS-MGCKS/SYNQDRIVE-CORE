import type { ProductSlug } from '@prisma/client';
import type { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import type { DtcSeverityBand } from '@modules/vehicle-intelligence/dtc/dtc-severity.util';
import {
  CORE_DTC_READ_CONTRACT_VERSION,
  type CoreDtcActiveFaultPreviewV1,
  type CoreDtcMonitoringStatusV1,
  type CoreDtcReadV1,
} from './core-dtc-read.v1.types';

export type DtcSummaryForCoreRead = Awaited<ReturnType<DtcService['getSummary']>>;

const CORE_DTC_MONITORING_STATUS_ALLOWLIST: ReadonlySet<CoreDtcMonitoringStatusV1> = new Set([
  'unavailable',
  'stale',
  'clean',
  'active_faults',
]);

const CORE_DTC_PREVIEW_MAX = 3;

function mapPreview(
  preview: DtcSummaryForCoreRead['activeFaultPreview'],
): CoreDtcActiveFaultPreviewV1[] {
  return preview.slice(0, CORE_DTC_PREVIEW_MAX).map((item) => ({
    code: item.code,
    category: item.category,
    severityBand: item.severityBand as DtcSeverityBand,
  }));
}

function resolveWorstSeverityBand(
  status: CoreDtcMonitoringStatusV1,
  upstream: DtcSeverityBand,
): DtcSeverityBand | null {
  if (status !== 'active_faults') return null;
  return upstream;
}

function parseAllowlistedStatus(
  raw: DtcSummaryForCoreRead['status'] | undefined,
): CoreDtcMonitoringStatusV1 | null {
  if (typeof raw !== 'string') return null;
  return CORE_DTC_MONITORING_STATUS_ALLOWLIST.has(raw as CoreDtcMonitoringStatusV1)
    ? (raw as CoreDtcMonitoringStatusV1)
    : null;
}

/**
 * Normalizes upstream monitoringStatus and isStale so the Core contract never
 * exposes unknown status labels or stale/fresh contradictions.
 */
function resolveEffectiveMonitoring(summary: DtcSummaryForCoreRead): {
  monitoringStatus: CoreDtcMonitoringStatusV1;
  isStale: boolean;
} {
  const allowlisted = parseAllowlistedStatus(summary.status);
  if (allowlisted === null) {
    return { monitoringStatus: 'unavailable', isStale: true };
  }

  const upstreamStale = summary.isStale;
  const freshnessContradictsFreshState =
    upstreamStale !== false && (allowlisted === 'clean' || allowlisted === 'active_faults');

  if (freshnessContradictsFreshState) {
    return { monitoringStatus: 'stale', isStale: true };
  }

  if (allowlisted === 'stale') {
    return { monitoringStatus: 'stale', isStale: true };
  }

  if (allowlisted === 'unavailable') {
    return {
      monitoringStatus: 'unavailable',
      isStale: upstreamStale === false ? false : true,
    };
  }

  return { monitoringStatus: allowlisted, isStale: false };
}

export function toCoreDtcReadV1(input: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: DtcSummaryForCoreRead;
}): CoreDtcReadV1 {
  const { monitoringStatus, isStale } = resolveEffectiveMonitoring(input.summary);
  const worstUpstream = input.summary.worstSeverityBand as DtcSeverityBand;

  let activeFaultCount: number | null;
  let worstSeverityBand: DtcSeverityBand | null;
  let activeFaultPreview: CoreDtcActiveFaultPreviewV1[];

  switch (monitoringStatus) {
    case 'stale':
    case 'unavailable':
      activeFaultCount = null;
      worstSeverityBand = null;
      activeFaultPreview = [];
      break;
    case 'clean':
      activeFaultCount = 0;
      worstSeverityBand = null;
      activeFaultPreview = [];
      break;
    case 'active_faults':
      activeFaultCount = input.summary.activeFaultCount;
      worstSeverityBand = resolveWorstSeverityBand(monitoringStatus, worstUpstream);
      activeFaultPreview = mapPreview(input.summary.activeFaultPreview);
      break;
    default:
      activeFaultCount = null;
      worstSeverityBand = null;
      activeFaultPreview = [];
  }

  return {
    version: CORE_DTC_READ_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    productSlug: input.productSlug,
    monitoringStatus,
    isStale,
    lastPollAttemptAt: input.summary.lastCheckedAt,
    lastSuccessfulCheckAt: input.summary.lastSuccessfulCheckAt,
    activeFaultCount,
    worstSeverityBand,
    activeFaultPreview,
  };
}
