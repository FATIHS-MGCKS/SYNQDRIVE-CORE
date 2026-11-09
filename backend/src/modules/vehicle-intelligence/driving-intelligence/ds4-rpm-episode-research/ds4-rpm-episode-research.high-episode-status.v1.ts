import {
  DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS,
  type Ds4RpmEpisodeResearchEpisodeCategoryStatus,
} from './ds4-rpm-episode-research.contract.v1';

/**
 * Conservative high-episode status when zero episodes are admitted under an eligible reference.
 * NOT_OBSERVED is reserved for adequately sampled trips where no qualifying episode pattern was found.
 * NOT_ASSESSABLE covers fragmentation, censoring ambiguity, and insufficient contiguous label opportunity.
 */
export function resolveHighEpisodesStatusWhenZeroAdmitted(input: {
  readonly rejectedCandidateCount: number;
  readonly allHighCandidateRunCount: number;
  readonly longestEligibleSequenceLabelCount: number;
  readonly observedUniqueLabelCount: number;
  readonly admittedCountRange: { readonly min: number; readonly max: number };
}): Ds4RpmEpisodeResearchEpisodeCategoryStatus {
  if (input.rejectedCandidateCount > 0) {
    return 'NOT_ASSESSABLE';
  }
  if (input.admittedCountRange.min !== input.admittedCountRange.max) {
    return 'NOT_ASSESSABLE';
  }
  if (input.longestEligibleSequenceLabelCount < DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS) {
    return 'NOT_ASSESSABLE';
  }
  if (input.observedUniqueLabelCount < DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS) {
    return 'NOT_ASSESSABLE';
  }
  if (input.allHighCandidateRunCount === 0) {
    return 'NOT_OBSERVED';
  }
  return 'NOT_ASSESSABLE';
}
