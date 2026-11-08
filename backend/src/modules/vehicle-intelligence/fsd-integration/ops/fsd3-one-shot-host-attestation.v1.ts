/**
 * Host trust layer for one-shot FSD3 ops — not owner approval.
 * Must be set in the operator shell on the authorized host immediately before invocation.
 */
export const FSD3_ONE_SHOT_HOST_ATTESTATION_ENV = 'FSD3_ONE_SHOT_HOST_ATTESTATION' as const;

export function assertFsd3OneShotHostAttestation(env: NodeJS.ProcessEnv = process.env): void {
  if (env[FSD3_ONE_SHOT_HOST_ATTESTATION_ENV] !== '1') {
    throw new Error('FSD3_HOST_ATTESTATION_MISSING');
  }
}
