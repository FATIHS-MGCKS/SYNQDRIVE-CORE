export const ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU = 'OE_SERVICE_HISTORY_EU' as const;

export type OneAutoServiceHistoryEuEvent = {
  date_of_service_event?: unknown;
  mileage_observed?: unknown;
  mileage_unit?: unknown;
  service_provider?: unknown;
  service_type?: unknown;
  service_actions?: unknown;
  [key: string]: unknown;
};

export type OneAutoServiceHistoryEuParseOutcome =
  | {
      kind: 'SUCCESS_WITH_EVENTS';
      vehicleIdentificationNumber: string;
      serviceEvents: OneAutoServiceHistoryEuEvent[];
      rawResult: Record<string, unknown>;
    }
  | {
      kind: 'SUCCESS_EMPTY_HISTORY';
      vehicleIdentificationNumber: string;
      rawResult: Record<string, unknown>;
    }
  | { kind: 'INVALID_SHAPE'; reason: string };
