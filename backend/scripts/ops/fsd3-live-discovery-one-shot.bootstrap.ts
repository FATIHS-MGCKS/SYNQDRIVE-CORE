/**
 * P6B bootstrap — dynamic import only after pre-Node attestation stamp is validated.
 */
import { assertFsd3PreNodeApplicationGateV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-pre-node-gate.v1';

async function bootstrap(): Promise<void> {
  assertFsd3PreNodeApplicationGateV1();
  const { runFsd3LiveDiscoveryOneShotCliV1 } = await import('./fsd3-live-discovery-one-shot.main');
  await runFsd3LiveDiscoveryOneShotCliV1();
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
