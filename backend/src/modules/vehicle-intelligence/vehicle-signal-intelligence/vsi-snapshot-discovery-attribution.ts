import { isLatestStateAttributedToLink } from './vsi-readonly-composer.evidence';
import type { VsiLatestStateSnapshot, VsiSourceLinkRow } from './vsi-readonly-composer.types';

/**
 * Snapshot native discovery (P1b) uses the same attribution rules as the readonly composer,
 * with a verified active link count for the vehicle (never hardcoded to 1).
 */
export function resolveSnapshotNativeDiscoveryStateAttributed(input: {
  latestState: VsiLatestStateSnapshot | null;
  link: VsiSourceLinkRow;
  activeLinkCount: number;
}): boolean {
  if (!input.latestState) {
    return false;
  }
  const effectiveActiveLinkCount =
    input.activeLinkCount > 0 ? input.activeLinkCount : 1;
  return isLatestStateAttributedToLink({
    latestState: input.latestState,
    link: input.link,
    activeLinkCount: effectiveActiveLinkCount,
  });
}
