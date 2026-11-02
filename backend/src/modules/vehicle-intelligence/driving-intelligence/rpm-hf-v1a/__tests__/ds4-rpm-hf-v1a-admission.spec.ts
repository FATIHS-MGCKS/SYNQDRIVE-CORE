import {
  resolveDs4RpmHfV1aAdmission,
  resolveTripRpmProfileFromVsi,
  shouldSkipClickHouseRpmReadForAdmission,
} from '../ds4-rpm-hf-v1a-admission';

describe('ds4-rpm-hf-v1a-admission', () => {
  const completeRead = { hfReadComplete: true } as const;

  it('RPM_1HZ with HF data → ENABLED', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 't1',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: true,
      chReadAvailable: true,
      tenantScopeViolation: false,
      ...completeRead,
    });
    expect(admission.processingAllowed).toBe(true);
    expect(admission.processingStatus).toBe('ENABLED');
  });

  it('Audi RPM_STANDARD → disabled', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 't-audi',
      tripRpmProfile: 'RPM_STANDARD',
      vehicleActiveRpmProfile: 'RPM_STANDARD',
      hfDataPresent: true,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingAllowed).toBe(false);
    expect(admission.reasonCode).toBe('RPM_STANDARD_PROFILE');
  });

  it('vehicle RPM_1HZ does not admit unclassified historical trip', () => {
    const tripProfile = resolveTripRpmProfileFromVsi({
      tripId: 'old-trip',
      tripClassifications: [{ tripId: 'other', profile: 'RPM_1HZ' }],
    });
    expect(tripProfile).toBe('UNCLASSIFIED');
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 'old-trip',
      tripRpmProfile: tripProfile,
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: true,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingAllowed).toBe(false);
    expect(admission.processingStatus).toBe('DISABLED_TRIP_NOT_CLASSIFIED');
  });

  it('historical profile shift: trip classified STANDARD while vehicle active 1HZ', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 'legacy',
      tripRpmProfile: 'RPM_STANDARD',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: true,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingAllowed).toBe(false);
  });

  it('RPM_1HZ without HF data → DISABLED_NO_HF_DATA', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 't1',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: false,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingStatus).toBe('DISABLED_NO_HF_DATA');
  });

  it('ClickHouse unavailable', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 't1',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: false,
      chReadAvailable: false,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingStatus).toBe('DISABLED_CH_UNAVAILABLE');
  });

  it('NOT_APPLICABLE fuel', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'NOT_APPLICABLE',
      tripId: 'ev',
      tripRpmProfile: 'UNCLASSIFIED',
      vehicleActiveRpmProfile: null,
      hfDataPresent: false,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: true,
    });
    expect(admission.processingStatus).toBe('DISABLED_NOT_APPLICABLE');
  });

  it('RPM_1HZ with partial HF page → DISABLED_INCOMPLETE_HF_READ', () => {
    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability: 'APPLICABLE',
      tripId: 't1',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      hfDataPresent: true,
      chReadAvailable: true,
      tenantScopeViolation: false,
      hfReadComplete: false,
    });
    expect(admission.processingStatus).toBe('DISABLED_INCOMPLETE_HF_READ');
  });

  it('shouldSkipClickHouseRpmReadForAdmission for STANDARD profile', () => {
    expect(
      shouldSkipClickHouseRpmReadForAdmission({
        iceRpmApplicability: 'APPLICABLE',
        tripRpmProfile: 'RPM_STANDARD',
      }),
    ).toBe(true);
    expect(
      shouldSkipClickHouseRpmReadForAdmission({
        iceRpmApplicability: 'APPLICABLE',
        tripRpmProfile: 'RPM_1HZ',
      }),
    ).toBe(false);
  });
});
