import type { FsdP6cFleetManifestV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';
import type { FsdP6cLiveTestGoNoGoV1 } from '../p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../fsd3-one-shot-live-owner-gate.v1';
import { isFsdP6cLiveGoEligibleV1 } from '../p6c/fsd-p6c-go-no-go.v1';

export const SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED =
  'SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED' as const;
export const FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA =
  'FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA' as const;
export const SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED =
  'SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED' as const;
export const FSD_P6D_FORCE_MOCK_TRANSPORT = 'FSD_P6D_FORCE_MOCK_TRANSPORT' as const;

export type FsdP6dLiveFleetGateBundleV1 = {
  releaseShaAuthorized: boolean;
  fleetExecuteAuthorized: boolean;
  ownerAuthorized: boolean;
  hostAttestation: boolean;
  goNoGoEligible: boolean;
  manifestVehicleCount: number;
};

export function isFsdP6dForceMockTransportV1(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[FSD_P6D_FORCE_MOCK_TRANSPORT] === '1';
}

export function assertFsdP6dLiveCatalogDispatchAuthorizedV1(env: NodeJS.ProcessEnv = process.env): void {
  if (env[SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED] !== '1') {
    throw new Error('FSD_P6D_LIVE_CATALOG_DISPATCH_NOT_AUTHORIZED');
  }
}

export function evaluateFsdP6dLiveFleetGateBundleV1(input: {
  env?: NodeJS.ProcessEnv;
  releaseSha: string;
  manifest: FsdP6cFleetManifestV1;
  goNoGo: FsdP6cLiveTestGoNoGoV1;
}): FsdP6dLiveFleetGateBundleV1 {
  const env = input.env ?? process.env;
  const authorizedSha = env[FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]?.trim();
  return {
    releaseShaAuthorized: Boolean(authorizedSha && authorizedSha === input.releaseSha),
    fleetExecuteAuthorized: env[SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED] === '1',
    ownerAuthorized: input.goNoGo.gates.ownerAuthorizationSatisfied,
    hostAttestation: env.FSD3_ONE_SHOT_HOST_ATTESTATION === '1',
    goNoGoEligible: isFsdP6cLiveGoEligibleV1(input.goNoGo.gates),
    manifestVehicleCount: input.manifest.vehicles.length,
  };
}

/**
 * Fail-closed live fleet execute gate — distinct from PM2 flags; CLI/process scoped only.
 */
export function assertFsdP6dLiveFleetExecuteGateV1(input: {
  env?: NodeJS.ProcessEnv;
  releaseSha: string;
  manifest: FsdP6cFleetManifestV1;
  goNoGo: FsdP6cLiveTestGoNoGoV1;
  liveProvider: 'dimo_live' | 'mock';
  forceMockTransport: boolean;
}): FsdP6dLiveFleetGateBundleV1 {
  const env = input.env ?? process.env;

  if (input.liveProvider !== 'dimo_live') {
    throw new Error('FSD_P6D_LIVE_FLEET_REQUIRES_DIMO_LIVE_PROVIDER');
  }
  if (input.forceMockTransport) {
    if (env.NODE_ENV === 'production' && env.FSD_P6D_ALLOW_MOCK_TRANSPORT_IN_PRODUCTION !== '1') {
      throw new Error('FSD_P6D_MOCK_TRANSPORT_FORBIDDEN_IN_PRODUCTION');
    }
  }

  if (env.FSD3_ONE_SHOT_HOST_ATTESTATION !== '1') {
    throw new Error('FSD3_HOST_ATTESTATION_MISSING');
  }
  if (env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] !== '1') {
    throw new Error('FSD3_LIVE_OWNER_NOT_AUTHORIZED');
  }

  const bundle = evaluateFsdP6dLiveFleetGateBundleV1({
    env,
    releaseSha: input.releaseSha,
    manifest: input.manifest,
    goNoGo: input.goNoGo,
  });

  if (!bundle.fleetExecuteAuthorized) {
    throw new Error('FSD_P6D_LIVE_FLEET_EXECUTE_NOT_AUTHORIZED');
  }
  if (!bundle.releaseShaAuthorized) {
    throw new Error('FSD_P6D_LIVE_FLEET_RELEASE_SHA_MISMATCH');
  }
  if (!bundle.goNoGoEligible) {
    throw new Error('FSD_P6D_LIVE_FLEET_GO_NO_GO_NO_GO');
  }
  if (input.manifest.productionManifest !== true) {
    throw new Error('FSD_P6D_LIVE_FLEET_PRODUCTION_MANIFEST_REQUIRED');
  }
  if (input.manifest.offlineFixtureHydration === true) {
    throw new Error('FSD_P6D_LIVE_FLEET_OFFLINE_FIXTURE_FORBIDDEN');
  }

  return bundle;
}
