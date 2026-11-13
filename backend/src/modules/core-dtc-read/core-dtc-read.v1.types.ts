import type { ProductSlug } from '@prisma/client';
import type { DtcSeverityBand } from '@modules/vehicle-intelligence/dtc/dtc-severity.util';

/**
 * Contract `core.dtc.read.v1` — fail-closed technical DTC monitoring read.
 *
 * Source: `DtcService.getSummary` mapped with Core fail-closed rules (stale/unavailable
 * suppress counts and preview even when upstream 01A shows last-known faults).
 *
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M.
 */
export const CORE_DTC_READ_CONTRACT_VERSION = 'core.dtc.read.v1' as const;

export type CoreDtcMonitoringStatusV1 =
  | 'unavailable'
  | 'stale'
  | 'clean'
  | 'active_faults';

export type CoreDtcActiveFaultPreviewV1 = {
  code: string;
  category: string;
  severityBand: DtcSeverityBand;
};

export type CoreDtcReadV1 = {
  version: typeof CORE_DTC_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  monitoringStatus: CoreDtcMonitoringStatusV1;
  isStale: boolean;
  lastPollAttemptAt: string | null;
  lastSuccessfulCheckAt: string | null;
  activeFaultCount: number | null;
  worstSeverityBand: DtcSeverityBand | null;
  activeFaultPreview: CoreDtcActiveFaultPreviewV1[];
};
