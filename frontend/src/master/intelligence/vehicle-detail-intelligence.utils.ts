import type { MasterIntelligenceContextState } from './master-intelligence.types';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from './master-intelligence.types';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';
import {
  emptyIntelligenceContext,
  mergeMasterIntelligenceContext,
} from './master-intelligence-url';

export const VEHICLE_DETAIL_ENGINE_RPM_SIGNAL_KEY = 'engine_rpm';

export type VehicleDetailProviderLinkPick = {
  linkId: string | null;
  /** More than one profile exists for the vehicle. */
  ambiguous: boolean;
  /** User or API selected a link that is not in the current profile list. */
  staleSelection: boolean;
  /** Navigation may proceed without further link selection. */
  navigationReady: boolean;
};

/**
 * Resolves which provider source link may be used for cross-module navigation.
 * Never picks the first profile when multiple candidates exist without an explicit match.
 */
export function pickPrimaryProviderSourceLink(
  profiles: MasterVsiProfileSummaryDto[],
  preferredLinkId: string | null,
): VehicleDetailProviderLinkPick {
  if (profiles.length === 0) {
    return { linkId: null, ambiguous: false, staleSelection: false, navigationReady: false };
  }
  if (profiles.length === 1) {
    const soleId = profiles[0]!.providerSourceLinkId;
    if (preferredLinkId && preferredLinkId !== soleId) {
      return { linkId: null, ambiguous: false, staleSelection: true, navigationReady: false };
    }
    return {
      linkId: soleId,
      ambiguous: false,
      staleSelection: false,
      navigationReady: true,
    };
  }
  if (preferredLinkId) {
    const match = profiles.some((p) => p.providerSourceLinkId === preferredLinkId);
    if (match) {
      return {
        linkId: preferredLinkId,
        ambiguous: true,
        staleSelection: false,
        navigationReady: true,
      };
    }
    return { linkId: null, ambiguous: true, staleSelection: true, navigationReady: false };
  }
  return { linkId: null, ambiguous: true, staleSelection: false, navigationReady: false };
}

export function profileForProviderSourceLink(
  profiles: MasterVsiProfileSummaryDto[],
  linkId: string | null,
): MasterVsiProfileSummaryDto | null {
  if (!linkId) return null;
  return profiles.find((p) => p.providerSourceLinkId === linkId) ?? null;
}

export type EngineRpmDeepLinkEligibility = {
  eligible: boolean;
  reasonKey:
    | 'eligible'
    | 'notApplicable'
    | 'unknownApplicability'
    | 'evaluationBlocked'
    | 'noProfile';
};

/** Uses persisted VSI profile summary fields only — does not infer from powertrain or vehicle type. */
export function assessEngineRpmDeepLinkEligibility(
  profile: MasterVsiProfileSummaryDto | null,
): EngineRpmDeepLinkEligibility {
  if (!profile) return { eligible: false, reasonKey: 'noProfile' };
  if (profile.evaluationBlocked) return { eligible: false, reasonKey: 'evaluationBlocked' };
  if (profile.rpmApplicability === 'NOT_APPLICABLE') {
    return { eligible: false, reasonKey: 'notApplicable' };
  }
  if (profile.rpmApplicability === 'APPLICABLE') {
    return { eligible: true, reasonKey: 'eligible' };
  }
  return { eligible: false, reasonKey: 'unknownApplicability' };
}

export type VehicleDetailVsiNavTarget = 'overview' | 'ledger' | 'engine_rpm_detail';

export function buildVehicleDetailIntelligenceNavContext(input: {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  physicalDeviceId: string | null;
  vsiTarget?: VehicleDetailVsiNavTarget;
}): MasterIntelligenceContextState {
  const base = mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
    orgId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    physicalDeviceId: input.physicalDeviceId,
    apdOpportunityId: null,
    policyVersion: null,
    apdEpochId: null,
    asOf: null,
    rejectedParams: [],
  });

  if (!input.vsiTarget || input.vsiTarget === 'overview') {
    return mergeMasterIntelligenceContext(base, {
      vsiTab: 'overview',
      signalKey: null,
    });
  }
  if (input.vsiTarget === 'ledger') {
    return mergeMasterIntelligenceContext(base, {
      vsiTab: 'ledger',
      signalKey: null,
    });
  }
  return mergeMasterIntelligenceContext(base, {
    vsiTab: 'ledger',
    signalKey: VEHICLE_DETAIL_ENGINE_RPM_SIGNAL_KEY,
  });
}

export function formatProviderLinkLabel(profile: MasterVsiProfileSummaryDto): string {
  const provider = profile.provider ?? profile.providerIdentity;
  return `${provider} · rev ${profile.profileRevision}`;
}

/**
 * PDI list resolution proves at most one INSTALLED device on the vehicle, not binding to a
 * specific provider source link. Omit device id from VSI/APDS URL context when multiple links exist.
 */
export function resolveNavPhysicalDeviceIdForProviderContext(input: {
  profileCount: number;
  navigationReady: boolean;
  physicalDeviceId: string | null;
}): string | null {
  if (!input.navigationReady || !input.physicalDeviceId) return null;
  if (input.profileCount > 1) return null;
  return input.physicalDeviceId;
}

export { EMPTY_MASTER_INTELLIGENCE_CONTEXT };
