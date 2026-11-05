import { describe, expect, it } from 'vitest';
import { parseServiceScheduleFromJobResult } from './oneauto-service-schedule-result.util';

describe('parseServiceScheduleFromJobResult', () => {
  it('parses normal and extra services from success envelope', () => {
    const parsed = parseServiceScheduleFromJobResult({
      job: {
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
      },
      latestResponse: {
        httpStatus: 200,
        providerStatusHeader: null,
        fetchedAt: '',
        responseBodyJson: {
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
        },
      },
      actualChargeKnown: false,
      actualChargeMinor: null,
    });
    expect(parsed.normalServices).toHaveLength(1);
    expect(parsed.extraServices).toHaveLength(0);
    expect(parsed.normalServices[0].tasks[0].action).toBe('Replace');
  });
});
