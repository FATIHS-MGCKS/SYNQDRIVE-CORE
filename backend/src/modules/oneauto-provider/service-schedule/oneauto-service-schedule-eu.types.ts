export const ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU = 'OE_SERVICE_SCHEDULE' as const;

/** Provider task row — unknown fields preserved on `raw`. */
export type OneAutoOeServiceScheduleTask = Record<string, unknown> & {
  task_id?: string;
  task_description?: string;
  task_action?: string;
  vehicle_position?: string;
};

/** Provider part row — unknown fields preserved on `raw`. */
export type OneAutoOeServiceSchedulePart = Record<string, unknown> & {
  part_number?: string;
  part_desc?: string;
  supplier_id?: number;
  supplier_desc?: string;
  part_grade?: string;
  oe_part_number?: string;
  part_attributes?: Record<string, unknown>[];
};

/** Provider service row — unknown fields preserved on `raw`. */
export type OneAutoOeServiceScheduleService = Record<string, unknown> & {
  service_id?: string;
  service_interval_desc?: string;
  service_months?: number;
  service_kms?: number;
  service_miles?: number;
  service_description?: string;
  service_time_hours?: number;
  service_tasks?: OneAutoOeServiceScheduleTask[];
  service_parts?: OneAutoOeServiceSchedulePart[];
};

export type OneAutoOeServiceScheduleParseOutcome =
  | { kind: 'INVALID_SHAPE'; reason: string }
  | {
      kind: 'SUCCESS_EMPTY_SCHEDULE';
      vehicleIdentificationNumber: string;
      rawResult: Record<string, unknown>;
    }
  | {
      kind: 'SUCCESS_WITH_SERVICES';
      vehicleIdentificationNumber: string;
      normalServices: OneAutoOeServiceScheduleService[];
      extraServices: OneAutoOeServiceScheduleService[];
      rawResult: Record<string, unknown>;
    };
