import { SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED } from '../../p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../../fsd3-one-shot-live-owner-gate.v1';
import {
  assertFsdP6dLiveFleetExecuteGateV1,
  FSD_P6D_FORCE_MOCK_TRANSPORT,
  FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA,
  SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED,
} from '../fsd-p6d-live-fleet-gate.v1';
import { productionGoNoGoFixture } from './fsd-p6d-test-fixtures.v1';

describe('FsdP6d live fleet gate', () => {
  const baseEnv = {
    FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
    [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
    [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
    [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '1',
    [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: 'release-sha-1',
    [FSD_P6D_FORCE_MOCK_TRANSPORT]: '1',
    NODE_ENV: 'test',
  };

  it('passes when all owner, GO, and release SHA gates align (mock transport)', () => {
    const { manifest, goNoGo } = productionGoNoGoFixture();
    expect(
      assertFsdP6dLiveFleetExecuteGateV1({
        env: baseEnv,
        releaseSha: 'release-sha-1',
        manifest,
        goNoGo,
        liveProvider: 'dimo_live',
        forceMockTransport: true,
      }).fleetExecuteAuthorized,
    ).toBe(true);
  });

  it('rejects missing fleet execute authorization', () => {
    const { manifest, goNoGo } = productionGoNoGoFixture();
    expect(() =>
      assertFsdP6dLiveFleetExecuteGateV1({
        env: { ...baseEnv, [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '0' },
        releaseSha: 'release-sha-1',
        manifest,
        goNoGo,
        liveProvider: 'dimo_live',
        forceMockTransport: true,
      }),
    ).toThrow(/FSD_P6D_LIVE_FLEET_EXECUTE_NOT_AUTHORIZED/);
  });

  it('rejects release SHA mismatch', () => {
    const { manifest, goNoGo } = productionGoNoGoFixture();
    expect(() =>
      assertFsdP6dLiveFleetExecuteGateV1({
        env: baseEnv,
        releaseSha: 'other-sha',
        manifest,
        goNoGo,
        liveProvider: 'dimo_live',
        forceMockTransport: true,
      }),
    ).toThrow(/FSD_P6D_LIVE_FLEET_RELEASE_SHA_MISMATCH/);
  });
});
