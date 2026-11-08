import { assertFsd3OneShotHostAttestation } from '../fsd3-one-shot-host-attestation.v1';

describe('Fsd3OneShotHostAttestation', () => {
  it('requires env flag exactly 1', () => {
    expect(() => assertFsd3OneShotHostAttestation({})).toThrow('FSD3_HOST_ATTESTATION_MISSING');
    expect(() => assertFsd3OneShotHostAttestation({ FSD3_ONE_SHOT_HOST_ATTESTATION: '0' })).toThrow(
      'FSD3_HOST_ATTESTATION_MISSING',
    );
    expect(() => assertFsd3OneShotHostAttestation({ FSD3_ONE_SHOT_HOST_ATTESTATION: '1' })).not.toThrow();
  });
});
