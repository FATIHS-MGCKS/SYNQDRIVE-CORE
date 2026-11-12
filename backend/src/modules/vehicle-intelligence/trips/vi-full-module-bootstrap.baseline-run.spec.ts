/**
 * Ephemeral baseline runner — copied to main worktree for comparison only (not committed on main).
 */
import {
  BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE,
  probeVehicleIntelligenceModuleCompile,
} from './vi-full-module-bootstrap.probe';

const RUN_BASELINE_REPLAY = process.env.VI_BASELINE_PROBE_REPLAY === '1';

(RUN_BASELINE_REPLAY ? describe : describe.skip)(
  'VehicleIntelligenceModule bootstrap — baseline probe replay',
  () => {
  it('executes probe and prints outcome for baseline comparison', async () => {
    const result = await probeVehicleIntelligenceModuleCompile();
    if (result.outcome === 'PASS') {
      await result.moduleRef.close();
      // eslint-disable-next-line no-console
      console.log('BASELINE_PROBE_OUTCOME=PASS');
      expect(result.outcome).toBe('PASS');
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`BASELINE_PROBE_OUTCOME=FAIL`);
    // eslint-disable-next-line no-console
    console.log(`BASELINE_PROBE_MESSAGE=${result.message}`);
  // eslint-disable-next-line no-console
  console.log(`BASELINE_PROBE_SIGNATURE_MATCH=${result.message.includes(BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE)}`);
    expect(result.outcome).toBe('FAIL');
  }, 180_000);
  },
);
