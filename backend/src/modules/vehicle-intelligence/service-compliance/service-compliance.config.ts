/** HM/OEM next-service values older than this are STALE (not active truth). */
export const HM_OEM_SERVICE_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

export const NEXT_SERVICE_WARNING_DAYS = 30;
export const NEXT_SERVICE_WARNING_KM = 1500;

/** TÜV / BOKraft due-soon window (SynqDrive compliance fields). */
export const TUV_BOKRAFT_WARNING_DAYS = 30;

/** Odometer readings older than this are flagged ODOMETER_STALE in computed forecasts. */
export const MAINTENANCE_ODOMETER_STALE_DAYS = 14;
/** HM OEM vs computed remaining values differing by more than these tolerances are a visible conflict. */
export const MAINTENANCE_CONFLICT_KM_TOLERANCE = 1000;
export const MAINTENANCE_CONFLICT_DAYS_TOLERANCE = 30;
