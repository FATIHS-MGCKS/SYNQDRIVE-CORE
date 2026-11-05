import { OneAutoProviderJobStatus } from '@prisma/client';
import { buildOneAutoOeServiceHistoryEuBackfillDryRunPlan } from './oneauto-oe-service-history-eu-backfill.lib';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';

const ARTEON_VIN = 'WVWZZZ3HZLE010725';

describe('buildOneAutoOeServiceHistoryEuBackfillDryRunPlan', () => {
  it('validates persisted Arteon envelope without provider GET', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'job-1',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            vinSnapshot: ARTEON_VIN,
            serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
            status: OneAutoProviderJobStatus.SUCCEEDED,
            updatedAt: new Date(),
            responses: [
              {
                fetchedAt: new Date(),
                httpStatus: 200,
                responseBodyJson: {
                  success: true,
                  result: {
                    vehicle_identification_number: ARTEON_VIN,
                    service_events: [
                      {
                        date_of_service_event: '2024-04-22',
                        mileage_observed: 79439,
                        mileage_unit: 'km',
                        service_provider: 'ATU',
                        service_type: 'Maintenance',
                        service_actions: ['Oil'],
                      },
                      {
                        date_of_service_event: '2020-01-30',
                        mileage_observed: 0,
                        mileage_unit: 'km',
                        service_provider: 'VW',
                        service_type: 'Delivery inspection',
                        service_actions: ['Delivery inspection.'],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ]),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ vin: ARTEON_VIN }),
      },
    } as any;

    const plans = await buildOneAutoOeServiceHistoryEuBackfillDryRunPlan(prisma, {
      vehicleId: 'veh-1',
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.providerEventsExpected).toBe(2);
    expect(plans[0]!.importEventsExpected).toBe(2);
    expect(plans[0]!.validationErrors).toHaveLength(0);
    expect(plans[0]!.events.every((e) => e.mapOk)).toBe(true);
  });
});
