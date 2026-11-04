import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-replay.contract.v1';

export type Ds4RpmRealDataBundleValidationResultV1 =
  | { ok: true; resolvedTelemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily> }
  | { ok: false; reasonCodes: readonly string[] };

export function validateDs4RpmRealDataOfflineInputBundleV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
): Ds4RpmRealDataBundleValidationResultV1 {
  const reasonCodes: string[] = [];

  if (bundle.executionBoundary !== 'OFFLINE_INJECTED_BUNDLE_ONLY') {
    reasonCodes.push('EXECUTION_BOUNDARY_NOT_OFFLINE');
  }
  if (bundle.ownerAuthorizedProductionExecutionDeclared !== false) {
    reasonCodes.push('PRODUCTION_EXECUTION_FLAG_MUST_REMAIN_FALSE');
  }
  if (bundle.dimoBucketIntervalSeconds !== 1) {
    reasonCodes.push('DIMO_BUCKET_INTERVAL_NOT_1S');
  }

  const ti = bundle.tripInput;
  if (ti.organizationId !== bundle.organizationId) reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  if (ti.vehicleId !== bundle.vehicleId) reasonCodes.push('VEHICLE_ID_MISMATCH');
  if (ti.tripId !== bundle.tripId) reasonCodes.push('TRIP_ID_MISMATCH');
  if (ti.providerSourceLinkId !== bundle.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }

  const resolved = resolveTelemetrySourceFamily(bundle.dimoVehicleRawJson);
  if (resolved === 'UNKNOWN') {
    reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  if (bundle.v1bResult) {
    if (bundle.v1bResult.organizationId !== bundle.organizationId) {
      reasonCodes.push('V1B_ORGANIZATION_MISMATCH');
    }
    if (bundle.v1bResult.vehicleId !== bundle.vehicleId) reasonCodes.push('V1B_VEHICLE_MISMATCH');
    if (bundle.v1bResult.tripId !== bundle.tripId) reasonCodes.push('V1B_TRIP_MISMATCH');
    if (
      bundle.v1bResult.providerSourceLinkId != null &&
      bundle.v1bResult.providerSourceLinkId !== bundle.providerSourceLinkId
    ) {
      reasonCodes.push('V1B_SOURCE_LINK_MISMATCH');
    }
  }

  if (reasonCodes.length > 0) {
    return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
  }
  return { ok: true, resolvedTelemetrySourceFamily: resolved };
}
