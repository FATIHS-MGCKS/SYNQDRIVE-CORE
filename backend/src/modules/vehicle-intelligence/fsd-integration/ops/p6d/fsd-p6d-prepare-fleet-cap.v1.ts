/**
 * PREPARE live catalog fetch fleet disclosure cap — fail closed before any provider dispatch.
 */
export function assertFsdP6dPrepareFleetDisclosureCapV1(input: {
  fleetPlannedRequestDisclosureCap: number | null | undefined;
  prepareLedgerAttemptsCommitted: number;
  executePlannedFleetCumulativeRequests: number;
  pendingCatalogDispatches: number;
}): void {
  if (input.fleetPlannedRequestDisclosureCap == null) {
    return;
  }
  const projectedTotal =
    input.prepareLedgerAttemptsCommitted +
    input.executePlannedFleetCumulativeRequests +
    input.pendingCatalogDispatches;
  if (projectedTotal > input.fleetPlannedRequestDisclosureCap) {
    throw new Error('FSD_P6D_PREPARE_FLEET_DISCLOSURE_CAP_NO_GO');
  }
}
