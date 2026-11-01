import {
  computeTripDiBoundaryAdmissionRecoveryEligibleFrom,
  DEFAULT_RECOVERY_LOOKBACK_HOURS,
  isTripDiBoundaryAdmissionRecoveryEnabled,
  isTripDiBoundaryAdmissionRecoveryVehicleEligible,
  readTripDiBoundaryAdmissionRecoveryPolicyFromEnv,
} from '../trip-di-boundary-admission-recovery.policy';

describe('trip-di-boundary-admission-recovery.policy', () => {
  const org = 'org-1';
  const veh = 'veh-1';

  it('defaults writer OFF and recovery disabled without activation timestamp', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({});
    expect(isTripDiBoundaryAdmissionRecoveryEnabled(policy)).toBe(false);
    expect(policy.writerEnabled).toBe(false);
    expect(policy.lookbackHours).toBe(DEFAULT_RECOVERY_LOOKBACK_HOURS);
  });

  it('eligible lower bound is max(activation, now − lookback)', () => {
    const activation = new Date('2026-10-20T00:00:00.000Z');
    const now = new Date('2026-10-31T12:00:00.000Z');
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC: activation.toISOString(),
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_LOOKBACK_HOURS: '48',
    });
    const from = computeTripDiBoundaryAdmissionRecoveryEligibleFrom(policy, now)!;
    expect(from.toISOString()).toBe('2026-10-29T12:00:00.000Z');
    const earlyNow = new Date('2026-10-21T00:00:00.000Z');
    const from2 = computeTripDiBoundaryAdmissionRecoveryEligibleFrom(policy, earlyNow)!;
    expect(from2.toISOString()).toBe(activation.toISOString());
  });

  it('requires S4 master and explicit allowlists for vehicle eligibility', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: org,
      DI_V0_S4_VEHICLE_ALLOWLIST: veh,
    });
    expect(
      isTripDiBoundaryAdmissionRecoveryVehicleEligible(policy, {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
      }),
    ).toBe(true);
    expect(
      isTripDiBoundaryAdmissionRecoveryVehicleEligible(policy, {
        organizationId: org,
        vehicleId: 'other',
        vehicleOrganizationId: org,
      }),
    ).toBe(false);
  });

  it('never infers activation from writer flag alone', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_WRITER_ENABLED: 'true',
    });
    expect(isTripDiBoundaryAdmissionRecoveryEnabled(policy)).toBe(false);
  });
});
