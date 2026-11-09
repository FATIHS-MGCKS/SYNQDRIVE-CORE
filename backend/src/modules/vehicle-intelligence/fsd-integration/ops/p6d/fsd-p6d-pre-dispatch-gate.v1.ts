import type { FsdP6cFleetManifestV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';
import type { FsdP6cFleetDiscoveryPlanReportV1 } from '../p6c/fsd-p6c-fleet-plan.v1';
import type { FsdP6cLiveTestGoNoGoV1 } from '../p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../fsd3-one-shot-live-owner-gate.v1';
import { resolveFsdP6cArchitectureReviewClearedV1 } from '../p6c/fsd-p6c-go-no-go.v1';
import {
  assertFsdP6dLiveCatalogDispatchAuthorizedV1,
  assertFsdP6dMockTransportForbiddenOnProductionV1,
  evaluateFsdP6dLiveFleetGateBundleV1,
  SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED,
} from './fsd-p6d-live-fleet-gate.v1';

export type FsdP6dPreDispatchContextV1 = 'PREPARE_CATALOG_FETCH' | 'EXECUTE_FLEET';

/**
 * H2 — owner/host/architecture/budget gates before any live provider catalog request or fleet execute.
 */
export function assertFsdP6dProviderPreDispatchGateV1(input: {
  env?: NodeJS.ProcessEnv;
  context: FsdP6dPreDispatchContextV1;
  releaseSha: string;
  goNoGo: FsdP6cLiveTestGoNoGoV1;
  planReport: FsdP6cFleetDiscoveryPlanReportV1;
  forceMockTransport: boolean;
  manifest: FsdP6cFleetManifestV1;
}): void {
  const env = input.env ?? process.env;

  assertFsdP6dMockTransportForbiddenOnProductionV1(env, input.forceMockTransport);

  if (env.FSD3_ONE_SHOT_HOST_ATTESTATION !== '1') {
    throw new Error('FSD3_HOST_ATTESTATION_MISSING');
  }
  if (env[SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED] !== '1') {
    throw new Error('FSD3_LIVE_OWNER_NOT_AUTHORIZED');
  }
  if (!resolveFsdP6cArchitectureReviewClearedV1(env)) {
    throw new Error('FSD_P6C_ARCHITECTURE_REVIEW_NOT_CLEARED');
  }
  if (input.manifest.productionManifest !== true) {
    throw new Error('FSD_P6D_LIVE_FLEET_PRODUCTION_MANIFEST_REQUIRED');
  }
  if (
    input.context === 'EXECUTE_FLEET' &&
    input.planReport.planCompleteness === 'CATALOG_PENDING'
  ) {
    throw new Error('FSD_P6D_PRE_DISPATCH_CATALOG_PENDING');
  }
  if (!input.goNoGo.gates.ownerAuthorizationSatisfied) {
    throw new Error('FSD_P6D_PRE_DISPATCH_OWNER_NOT_SATISFIED');
  }

  if (input.context === 'PREPARE_CATALOG_FETCH') {
    assertFsdP6dLiveCatalogDispatchAuthorizedV1(env);
    return;
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
  if (env[SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED] !== '1') {
    throw new Error('FSD_P6D_LIVE_FLEET_EXECUTE_NOT_AUTHORIZED');
  }
}
