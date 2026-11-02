import {
  assertObservabilityWritesAllowed,
  collectManualObservabilityActivationAttestations,
  collectOperatorObservabilityReleaseGates,
} from './trip-end-validation-observability-activation.readiness';
import { TDL_OBS_TEST_RETENTION_CONFIG } from './trip-end-validation-observability-test.helpers';

describe('trip-end-validation observability activation readiness (PR1)', () => {
  const vehicleId = '11111111-1111-4111-8111-111111111111';

  it('RETENTION_READY_ACK alone is insufficient without operator release gates', () => {
    const env = {
      TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK: 'true',
    } as NodeJS.ProcessEnv;
    const manual = collectManualObservabilityActivationAttestations(env);
    expect(manual.some((f) => f.code === 'ACTIVATION_ACK_MISSING')).toBe(true);
    const operator = collectOperatorObservabilityReleaseGates(vehicleId, env);
    expect(operator.some((f) => f.code === 'GLOBAL_FLAG_OFF')).toBe(true);
  });

  it('collects operator allowlist and global flag blockers', () => {
    const env = {
      TRIP_END_VALIDATION_OBSERVABILITY_ENABLED: 'true',
      TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS: 'other-id',
    } as NodeJS.ProcessEnv;
    const findings = collectOperatorObservabilityReleaseGates(vehicleId, env);
    expect(findings.some((f) => f.code === 'VEHICLE_NOT_ALLOWLISTED')).toBe(true);
  });

  it('assertObservabilityWritesAllowed fails closed when PR0 table missing', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
    } as never;
    const env = {
      TRIP_END_VALIDATION_OBSERVABILITY_ENABLED: 'true',
      TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS: vehicleId,
      TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK: 'true',
      TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT: 'true',
      TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK: 'true',
    } as NodeJS.ProcessEnv;
    const blockers = await assertObservabilityWritesAllowed(
      prisma,
      vehicleId,
      TDL_OBS_TEST_RETENTION_CONFIG,
      env,
    );
    expect(blockers.some((b) => b.code === 'PR0_TABLE_MISSING')).toBe(true);
  });
});
