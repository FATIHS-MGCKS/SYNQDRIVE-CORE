import { buildFsd3OneShotCliFsd4DisabledConfigV1, buildFsd3OneShotCliOrchestrationConfigV1 } from '../fsd3-one-shot-cli-fsd3-config.v1';

describe('Fsd3 one-shot CLI orchestration config', () => {
  it('enables FSD3 only for the allowlisted vehicle', () => {
    const vehicleId = '22222222-2222-4222-8222-222222222222';
    const cfg = buildFsd3OneShotCliOrchestrationConfigV1(vehicleId);
    expect(cfg.enabled).toBe(true);
    expect(cfg.providerExecutionEnabled).toBe(true);
    expect(cfg.allowedVehicleIds.has(vehicleId)).toBe(true);
    expect(cfg.allowedVehicleIds.size).toBe(1);
  });

  it('keeps FSD4 disabled for the ops CLI process', () => {
    const fsd4 = buildFsd3OneShotCliFsd4DisabledConfigV1();
    expect(fsd4.enabled).toBe(false);
    expect(fsd4.providerExecutionEnabled).toBe(false);
  });
});
