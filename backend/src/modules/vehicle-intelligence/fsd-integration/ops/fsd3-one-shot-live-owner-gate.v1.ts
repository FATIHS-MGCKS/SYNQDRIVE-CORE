import { assertFsd3OneShotHostAttestation } from './fsd3-one-shot-host-attestation.v1';

export const SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED =
  'SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED' as const;

/**
 * Dual acknowledgment for the first production DIMO one-shot:
 * owner authorization env + operator shell attestation (not cryptographic L2).
 */
export function assertFsd3OneShotLiveExecuteOwnerAuthorized(env: NodeJS.ProcessEnv = process.env): void {
  if (env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] !== '1') {
    throw new Error('FSD3_LIVE_OWNER_AUTHORIZATION_MISSING');
  }
  assertFsd3OneShotHostAttestation(env);
}
