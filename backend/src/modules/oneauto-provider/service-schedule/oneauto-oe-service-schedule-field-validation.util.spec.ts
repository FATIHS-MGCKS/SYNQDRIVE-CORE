import {
  validateOeServiceSchedulePart,
  validateOeServiceScheduleService,
} from './oneauto-oe-service-schedule-field-validation.util';

describe('OE Service Schedule field validation', () => {
  it('rejects negative service_time_hours', () => {
    expect(
      validateOeServiceScheduleService({ service_time_hours: -1 }),
    ).toBe('service_time_hours_invalid');
  });

  it('rejects non-integer service_kms', () => {
    expect(validateOeServiceScheduleService({ service_kms: 1.5 })).toBe('service_kms_invalid');
  });

  it('allows missing optional interval fields', () => {
    expect(validateOeServiceScheduleService({ service_description: 'Oil' })).toBeNull();
  });

  it('rejects malformed part_attributes', () => {
    expect(
      validateOeServiceSchedulePart({ part_attributes: [{ name: 1, value: 'x' }] }),
    ).toBe('part_attributes[0].name_not_string');
  });
});
