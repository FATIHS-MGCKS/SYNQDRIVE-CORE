import { randomUUID } from 'crypto';
import { parseDiV0Ds4FleetMotionAdmissionPolicyV1 } from '../../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import { evaluateDiV0S4KillRow } from '../../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1 } from '../trip-di-boundary-admission-recovery.eligibility.v1';
import {
  TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED_ENV,
  readTripDiBoundaryAdmissionRecoveryPolicyFromEnv,
} from '../trip-di-boundary-admission-recovery.policy';

const org = randomUUID();
const veh = randomUUID();
const killOk = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'NOT_KILLED' });

describe('trip-di-boundary-admission-recovery.eligibility.v1', () => {
  it('fails closed when recovery is not activated', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({});
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      ds4FleetMotionPolicy: parseDiV0Ds4FleetMotionAdmissionPolicyV1({}),
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: { aftermarketDevice: { serial: 'R1-X' } },
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.failedTerms).toContain('RECOVERY_NOT_ACTIVATED');
  });

  it('accepts supported vehicle without legacy allowlist when recovery global authorized (not DS4 fleet rollout flag)', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC: '2026-11-01T00:00:00.000Z',
      [TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED_ENV]: 'true',
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const ds4FleetMotionPolicy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({});
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      ds4FleetMotionPolicy,
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: { syntheticDevice: { id: 1 } },
      },
    });
    expect(result.eligible).toBe(true);
    expect(result.s4DiscoveryPipelineAligned).toBe(false);
    expect(result.s4DiscoveryPipelineFailedTerms.length).toBeGreaterThan(0);
  });

  it('rejects UNKNOWN provider families', () => {
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv({
      TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC: '2026-11-01T00:00:00.000Z',
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: org,
      DI_V0_S4_VEHICLE_ALLOWLIST: veh,
    });
    const result = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      ds4FleetMotionPolicy: parseDiV0Ds4FleetMotionAdmissionPolicyV1({}),
      kill: killOk,
      vehicle: {
        organizationId: org,
        vehicleId: veh,
        vehicleOrganizationId: org,
        registryLifecycle: 'ACTIVE',
        dimoRawJson: null,
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.failedTerms.some((t) => t.startsWith('PROVIDER_'))).toBe(true);
  });
});
