import type {
  MasterIntelligenceContextState,
  MasterIntelligenceCrossLinkTarget,
  MasterIntelligenceView,
} from './master-intelligence.types';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from './master-intelligence.types';
import { EMPTY_VSI_LEDGER_FILTERS } from './vsi-ledger-url.types';

export type CrossLinkHygieneOptions = {
  /** Keep signalKey, tab, and ledger filters (explicit in-view signal navigation). */
  preserveVsiLedgerState?: boolean;
  /** Keep asOf when correlating VSI revisions with an APDS decision timestamp. */
  preserveAsOf?: boolean;
  /** physicalDeviceId may appear in URL (PDI binding scope or explicit device context). */
  physicalDeviceIdProven?: boolean;
};

function emptyVsiLedgerContext(): Pick<
  MasterIntelligenceContextState,
  'vsiTab' | 'signalKey' | 'ledgerFilters'
> {
  return {
    vsiTab: 'overview',
    signalKey: null,
    ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS },
  };
}

function emptyApdsScopeContext(): Pick<
  MasterIntelligenceContextState,
  'apdOpportunityId' | 'policyVersion' | 'apdEpochId'
> {
  return {
    apdOpportunityId: null,
    policyVersion: null,
    apdEpochId: null,
  };
}

export function rejectStaleProviderSourceLinkId(
  linkId: string | null,
  knownLinkIds: readonly string[],
): string | null {
  if (!linkId) return null;
  if (knownLinkIds.length === 0) return linkId;
  return knownLinkIds.includes(linkId) ? linkId : null;
}

/** Drop providerSourceLinkId when it is not in the verified profile/binding list. */
export function applyVerifiedProviderSourceLink(
  context: MasterIntelligenceContextState,
  knownLinkIds: readonly string[],
): MasterIntelligenceContextState {
  const linkId = rejectStaleProviderSourceLinkId(context.providerSourceLinkId, knownLinkIds);
  if (linkId === context.providerSourceLinkId) return context;
  return {
    ...context,
    providerSourceLinkId: linkId,
    ...emptyVsiLedgerContext(),
  };
}

/**
 * Normalize in-memory / URL context for a Master Intelligence view (same view, no cross-link).
 */
export function normalizeContextForIntelligenceView(
  view: MasterIntelligenceView,
  context: MasterIntelligenceContextState,
): MasterIntelligenceContextState {
  const base = {
    ...context,
    rejectedParams: context.rejectedParams ?? [],
  };

  if (view === 'apds-intelligence') {
    return {
      ...base,
      ...emptyVsiLedgerContext(),
      physicalDeviceId: null,
    };
  }

  return {
    ...base,
    ...emptyApdsScopeContext(),
    physicalDeviceId: base.physicalDeviceId,
  };
}

function hygieneOptionsFromPatch(
  patch: Partial<MasterIntelligenceContextState> | undefined,
): CrossLinkHygieneOptions {
  if (!patch) return {};
  return {
    preserveVsiLedgerState: patch.signalKey != null && patch.signalKey !== '',
    preserveAsOf: patch.asOf != null && patch.asOf !== '',
    physicalDeviceIdProven: patch.physicalDeviceId != null && patch.physicalDeviceId !== '',
  };
}

export function crossLinkHygieneOptionsFromPatch(
  patch: Partial<MasterIntelligenceContextState> | undefined,
): CrossLinkHygieneOptions {
  return hygieneOptionsFromPatch(patch);
}

/**
 * Build destination-safe context immediately before cross-module navigation.
 */
export function sanitizeMasterIntelligenceContextForTarget(
  target: MasterIntelligenceCrossLinkTarget,
  context: MasterIntelligenceContextState,
  opts: CrossLinkHygieneOptions = {},
): MasterIntelligenceContextState {
  const preserveVsi = opts.preserveVsiLedgerState === true;
  const preserveAsOf = opts.preserveAsOf === true;
  const deviceProven = opts.physicalDeviceIdProven === true;

  const core = {
    orgId: context.orgId,
    vehicleId: context.vehicleId,
    providerSourceLinkId: context.providerSourceLinkId,
    rejectedParams: context.rejectedParams ?? [],
  };

  switch (target) {
    case 'vehicles':
      return {
        ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
        ...core,
        physicalDeviceId: null,
      };
    case 'device-inventory':
      return {
        ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
        orgId: context.orgId,
        physicalDeviceId: deviceProven ? context.physicalDeviceId : null,
      };
    case 'apds-intelligence':
      return {
        ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
        ...core,
        apdOpportunityId: context.apdOpportunityId,
        policyVersion: context.policyVersion,
        apdEpochId: context.apdEpochId,
        asOf: context.asOf,
        physicalDeviceId: null,
      };
    case 'vsi-intelligence':
      return {
        ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
        ...core,
        asOf: preserveAsOf ? context.asOf : null,
        physicalDeviceId: deviceProven ? context.physicalDeviceId : null,
        ...(preserveVsi
          ? {
              vsiTab: context.vsiTab,
              signalKey: context.signalKey,
              ledgerFilters: context.ledgerFilters,
            }
          : emptyVsiLedgerContext()),
      };
  }
}

export function buildMasterIntelligenceSearchContext(
  view: MasterIntelligenceView,
  context: MasterIntelligenceContextState,
): MasterIntelligenceContextState {
  return normalizeContextForIntelligenceView(view, context);
}
