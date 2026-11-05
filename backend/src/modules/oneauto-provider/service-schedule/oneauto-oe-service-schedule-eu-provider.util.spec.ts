import {
  assertOeServiceScheduleEuJobBinding,
  parseOeServiceScheduleEuProviderResult,
} from './oneauto-oe-service-schedule-eu-provider.util';
import {
  buildOeServiceScheduleEmptyEnvelope,
  buildOeServiceScheduleSuccessEnvelope,
  ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
} from './oneauto-oe-service-schedule.fixtures';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './oneauto-service-schedule-eu.types';

describe('OE Service Schedule EU provider util (offline)', () => {
  it('parses normal and extra services with nested tasks and parts', () => {
    const envelope = buildOeServiceScheduleSuccessEnvelope();
    const parsed = parseOeServiceScheduleEuProviderResult(envelope.result as Record<string, unknown>);
    expect(parsed.kind).toBe('SUCCESS_WITH_SERVICES');
    if (parsed.kind !== 'SUCCESS_WITH_SERVICES') return;
    expect(parsed.normalServices).toHaveLength(1);
    expect(parsed.extraServices).toHaveLength(1);
    expect(parsed.normalServices[0].oem_custom_field).toBe('preserved-on-service');
    expect(parsed.normalServices[0].service_parts?.[0].vendor_extension).toBe('preserved');
  });

  it('treats empty arrays as verified empty schedule', () => {
    const envelope = buildOeServiceScheduleEmptyEnvelope();
    const parsed = parseOeServiceScheduleEuProviderResult(envelope.result as Record<string, unknown>);
    expect(parsed.kind).toBe('SUCCESS_EMPTY_SCHEDULE');
  });

  it('rejects missing service arrays', () => {
    const parsed = parseOeServiceScheduleEuProviderResult({
      vehicle_identification_number: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(parsed).toEqual({
      kind: 'INVALID_SHAPE',
      reason: 'normal_services_not_array',
    });
  });

  it('validates VIN binding against job snapshot', () => {
    const binding = assertOeServiceScheduleEuJobBinding({
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      providerResponseBody: buildOeServiceScheduleSuccessEnvelope(),
    });
    expect(binding.ok).toBe(true);
  });

  it('rejects VIN mismatch in binding', () => {
    const binding = assertOeServiceScheduleEuJobBinding({
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: 'WVWZZZ3HZLE010725',
      providerResponseBody: buildOeServiceScheduleSuccessEnvelope(),
    });
    expect(binding.ok).toBe(false);
  });
});
