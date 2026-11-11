import type { MasterVsiFleetOverviewDto } from './vsi-master-intelligence-api.types';

/** Verified link for FSD/VSI UI: URL wins; else first overview profile (same fallback as profile hook). */
export function resolveEffectiveProviderSourceLink(input: {
  urlLinkId: string | null;
  overview: MasterVsiFleetOverviewDto | null;
}): {
  effectiveLinkId: string | null;
  shouldPersistInUrl: boolean;
  knownLinkIds: string[];
} {
  const knownLinkIds = input.overview?.profiles.map((p) => p.providerSourceLinkId) ?? [];
  const urlValid =
    input.urlLinkId && knownLinkIds.length > 0
      ? knownLinkIds.includes(input.urlLinkId)
      : Boolean(input.urlLinkId);

  if (input.urlLinkId && urlValid) {
    return { effectiveLinkId: input.urlLinkId, shouldPersistInUrl: false, knownLinkIds };
  }

  if (input.urlLinkId && knownLinkIds.length > 0 && !knownLinkIds.includes(input.urlLinkId)) {
    return { effectiveLinkId: knownLinkIds[0] ?? null, shouldPersistInUrl: true, knownLinkIds };
  }

  if (!input.urlLinkId && knownLinkIds.length > 0) {
    return { effectiveLinkId: knownLinkIds[0], shouldPersistInUrl: true, knownLinkIds };
  }

  if (knownLinkIds.length === 0 && input.urlLinkId) {
    return { effectiveLinkId: input.urlLinkId, shouldPersistInUrl: false, knownLinkIds };
  }

  return { effectiveLinkId: input.urlLinkId, shouldPersistInUrl: false, knownLinkIds };
}
