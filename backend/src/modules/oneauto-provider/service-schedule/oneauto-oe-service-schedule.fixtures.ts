/** Offline OpenAPI-shaped fixtures — no live provider calls. */
export const ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN = 'WBA12345678901234';

export function buildOeServiceScheduleSuccessEnvelope(vin: string = ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN) {
  return {
    success: true,
    result: {
      vehicle_identification_number: vin,
      normal_services: [
        {
          service_id: 'SID1001',
          service_interval_desc: 'every 30000 km or 12 months',
          service_months: 12,
          service_kms: 30000,
          service_miles: 18641,
          service_description: 'Engine Oil, Filter',
          service_time_hours: 1,
          service_tasks: [
            {
              task_id: 'TID1001',
              task_description: 'Replace engine oil',
              task_action: 'Replace',
              vehicle_position: 'Vehicle On Floor',
            },
          ],
          service_parts: [
            {
              part_number: 'F026407231',
              part_desc: 'Oil Filter',
              supplier_id: 30,
              supplier_desc: 'BOSCH',
              part_grade: 'Grade A',
              oe_part_number: '074 115 562',
              part_attributes: [{ name: 'Outer diameter [mm]', value: '91' }],
              vendor_extension: 'preserved',
            },
          ],
          oem_custom_field: 'preserved-on-service',
        },
      ],
      extra_services: [
        {
          service_id: 'SID2001',
          service_description: 'Brake fluid change',
          service_time_hours: 0.5,
          service_tasks: [],
          service_parts: [],
        },
      ],
    },
  };
}

export function buildOeServiceScheduleEmptyEnvelope(vin: string = ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN) {
  return {
    success: true,
    result: {
      vehicle_identification_number: vin,
      normal_services: [],
      extra_services: [],
    },
  };
}
