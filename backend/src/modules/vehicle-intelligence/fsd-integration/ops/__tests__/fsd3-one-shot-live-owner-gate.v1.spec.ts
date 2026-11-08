import { assertFsd3OneShotLiveExecuteOwnerAuthorized } from '../fsd3-one-shot-live-owner-gate.v1';

describe('Fsd3 live owner execute gate', () => {
  it('requires owner authorization and host attestation', () => {
    expect(() => assertFsd3OneShotLiveExecuteOwnerAuthorized({} as NodeJS.ProcessEnv)).toThrow(
      'FSD3_LIVE_OWNER_AUTHORIZATION_MISSING',
    );
    expect(() =>
      assertFsd3OneShotLiveExecuteOwnerAuthorized({
        SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED: '1',
      } as NodeJS.ProcessEnv),
    ).toThrow('FSD3_HOST_ATTESTATION_MISSING');
    expect(() =>
      assertFsd3OneShotLiveExecuteOwnerAuthorized({
        SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED: '1',
        FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
