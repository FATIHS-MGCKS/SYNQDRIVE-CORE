import { describe, expect, it } from 'vitest';
import { parseServiceScheduleFromJobResult } from './oneauto-service-schedule-result.util';
import type { OneAutoJobResultResponse } from './oneauto-api.types';

const BASE_JOB: OneAutoJobResultResponse['job'] = {
  id: 'j1',
  organizationId: 'o1',
  vehicleId: 'v1',
  vinSnapshot: 'WBA12345678901234',
  serviceSku: 'OE_SERVICE_SCHEDULE',
  status: 'SUCCEEDED',
  idempotencyKey: 'k',
  providerRequestId: null,
  estimatedPriceMinor: 210,
  confirmedPriceMinor: 210,
  currency: 'EUR',
  pricingSourceVersion: 'v1',
  costConfirmedAt: null,
  actualChargeMinor: null,
  actualChargeKnown: false,
  pollAttemptCount: 0,
  lastErrorCode: null,
  initialProviderDispatchAt: null,
  expiresAt: null,
  providerResultExpiresAt: null,
  createdAt: '',
  updatedAt: '',
};

function resultWithBody(body: unknown): OneAutoJobResultResponse {
  return {
    job: BASE_JOB,
    latestResponse: {
      httpStatus: 200,
      providerStatusHeader: null,
      fetchedAt: '',
      responseBodyJson: body,
    },
    actualChargeKnown: false,
    actualChargeMinor: null,
  };
}

describe('parseServiceScheduleFromJobResult', () => {
  it('parses valid services with integrity VALID_WITH_SERVICES', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [
            {
              service_description: 'Oil service',
              service_tasks: [{ task_action: 'Replace', task_description: 'Oil' }],
              service_parts: [{ part_desc: 'Filter', oe_part_number: '123' }],
            },
          ],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_WITH_SERVICES');
    expect(parsed.normalServices).toHaveLength(1);
  });

  it('detects VIN mismatch', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WVWZZZ3HZLE010725',
          normal_services: [],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VIN_MISMATCH');
    expect(parsed.normalServices).toHaveLength(0);
  });

  it('classifies invalid work time as malformed', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [{ service_time_hours: -2 }],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('MALFORMED_OR_PARTIAL');
  });

  it('classifies malformed nested tasks', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [{ service_tasks: ['not-an-object'] }],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('MALFORMED_OR_PARTIAL');
  });

  it('accepts valid empty schedule', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_EMPTY');
  });

  it('allows missing optional interval fields on valid service', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [{ service_description: 'Check only' }],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_WITH_SERVICES');
    expect(parsed.normalServices[0].serviceMonths).toBeNull();
  });

  it('accepts JSON null on nested task and part fields in live-shaped payloads', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [
            {
              service_id: 'svc-1',
              service_description: 'Full service',
              service_tasks: [
                {
                  task_id: null,
                  task_action: 'Inspect',
                  task_description: null,
                  vehicle_position: null,
                },
              ],
              service_parts: [
                {
                  part_desc: 'Oil',
                  part_number: null,
                  oe_part_number: null,
                  supplier_desc: null,
                  part_grade: null,
                  supplier_id: null,
                  part_attributes: [],
                },
              ],
            },
          ],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_WITH_SERVICES');
    expect(parsed.normalServices[0].tasks[0].taskId).toBeNull();
    expect(parsed.normalServices[0].tasks[0].description).toBeNull();
    expect(parsed.normalServices[0].parts[0].oePartNumber).toBeNull();
  });

  it('accepts JSON null on optional numeric fields and maps parts with null oe_part_number', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        success: true,
        result: {
          vehicle_identification_number: 'WBA12345678901234',
          normal_services: [
            {
              service_description: 'Brake fluid',
              service_kms: null,
              service_miles: null,
              service_tasks: [{ task_action: 'Replace', task_description: 'Fluid' }],
              service_parts: [{ part_desc: 'Dot 4', oe_part_number: null, part_grade: null }],
            },
          ],
          extra_services: [],
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_WITH_SERVICES');
    expect(parsed.normalServices[0].serviceKms).toBeNull();
    expect(parsed.normalServices[0].parts[0].oePartNumber).toBeNull();
  });

  it('unwraps wrapped callback envelope', () => {
    const parsed = parseServiceScheduleFromJobResult(
      resultWithBody({
        status: 200,
        result: {
          success: true,
          result: {
            vehicle_identification_number: 'WBA12345678901234',
            normal_services: [],
            extra_services: [],
          },
        },
      }),
    );
    expect(parsed.integrity).toBe('VALID_EMPTY');
  });
});
