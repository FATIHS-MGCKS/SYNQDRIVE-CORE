import { resolveDiV0SourceFamily } from '../../driving-intelligence/position-acquisition/di-v0-position-source-family';
import {
  DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF,
  evaluateDiV0S4EnablementWithFleetMotionPolicyV1,
  type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
} from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import { resolveDs4ProviderCapabilityFromS4SourceFamilyV1 } from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-provider-capability.v1';
import type { DiV0S4EnablementScope, DiV0S4KillEvaluation } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import type { TripDiBoundaryAdmissionRecoveryPolicy } from './trip-di-boundary-admission-recovery.policy';
import { isTripDiBoundaryAdmissionRecoveryEnabled } from './trip-di-boundary-admission-recovery.policy';

export type TripDiBoundaryAdmissionRecoveryVehicleContextV1 = {
  organizationId: string;
  vehicleId: string;
  vehicleOrganizationId: string;
  registryLifecycle: string;
  dimoRawJson: unknown;
};

export type TripDiBoundaryAdmissionRecoveryEligibilityV1 = {
  eligible: boolean;
  failedTerms: string[];
  /** Whether vehicle matches production DS4 discovery pipeline (env fleet-motion policy unchanged). */
  s4DiscoveryPipelineAligned: boolean;
  s4DiscoveryPipelineFailedTerms: string[];
};

/**
 * Recovery vehicle eligibility — uses TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_GLOBAL_AUTHORIZED for
 * fleet-wide recovery (not DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED).
 */
export function evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1(params: {
  policy: TripDiBoundaryAdmissionRecoveryPolicy;
  /** Production DS4 fleet-motion policy (for discovery parity only). */
  ds4FleetMotionPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
  kill: DiV0S4KillEvaluation;
  vehicle: TripDiBoundaryAdmissionRecoveryVehicleContextV1;
}): TripDiBoundaryAdmissionRecoveryEligibilityV1 {
  const failedTerms: string[] = [];
  if (!isTripDiBoundaryAdmissionRecoveryEnabled(params.policy)) {
    failedTerms.push('RECOVERY_NOT_ACTIVATED');
    return {
      eligible: false,
      failedTerms,
      s4DiscoveryPipelineAligned: false,
      s4DiscoveryPipelineFailedTerms: [],
    };
  }
  if (params.vehicle.registryLifecycle !== 'ACTIVE') {
    failedTerms.push('REGISTRY_NOT_ACTIVE');
  }
  if (params.vehicle.vehicleOrganizationId !== params.vehicle.organizationId) {
    failedTerms.push('TENANCY_MISMATCH');
  }
  const scope: DiV0S4EnablementScope = {
    organizationId: params.vehicle.organizationId,
    vehicleId: params.vehicle.vehicleId,
    vehicleOrganizationId: params.vehicle.vehicleOrganizationId,
  };

  const recoveryAuthorizationPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 =
    params.policy.recoveryGlobalAuthorized
      ? { ...DI_V0_DS4_FLEET_MOTION_ADMISSION_POLICY_DEFAULT_OFF, globalRolloutAuthorized: true }
      : params.ds4FleetMotionPolicy;

  const recoveryS4 = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
    params.policy.s4,
    recoveryAuthorizationPolicy,
    'DISCOVERY',
    scope,
    params.kill,
  );
  for (const term of recoveryS4.failedTerms) {
    failedTerms.push(`S4_${term}`);
  }

  const discoveryPipeline = evaluateDiV0S4EnablementWithFleetMotionPolicyV1(
    params.policy.s4,
    params.ds4FleetMotionPolicy,
    'DISCOVERY',
    scope,
    params.kill,
  );

  if (
    !params.policy.recoveryGlobalAuthorized &&
    (!params.policy.s4.organizationAllowlist.size || !params.policy.s4.vehicleAllowlist.size)
  ) {
    failedTerms.push('LEGACY_ALLOWLIST_EMPTY');
  }

  const { sourceFamily } = resolveDiV0SourceFamily(params.vehicle.dimoRawJson);
  const provider = resolveDs4ProviderCapabilityFromS4SourceFamilyV1(sourceFamily);
  if (provider.state !== 'SUPPORTED') {
    failedTerms.push(`PROVIDER_${provider.state}`);
  }

  return {
    eligible: failedTerms.length === 0,
    failedTerms,
    s4DiscoveryPipelineAligned: discoveryPipeline.enabled,
    s4DiscoveryPipelineFailedTerms: discoveryPipeline.failedTerms,
  };
}
