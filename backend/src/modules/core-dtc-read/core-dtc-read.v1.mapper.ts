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

function mapPreview(
  preview: DtcSummaryForCoreRead['activeFaultPreview'],
): CoreDtcActiveFaultPreviewV1[] {
  return preview.map((item) => ({
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

export function toCoreDtcReadV1(input: {
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  summary: DtcSummaryForCoreRead;
}): CoreDtcReadV1 {
  const monitoringStatus = input.summary.status as CoreDtcMonitoringStatusV1;
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
    isStale: input.summary.isStale,
    lastPollAttemptAt: input.summary.lastCheckedAt,
    lastSuccessfulCheckAt: input.summary.lastSuccessfulCheckAt,
    activeFaultCount,
    worstSeverityBand,
    activeFaultPreview,
  };
}
