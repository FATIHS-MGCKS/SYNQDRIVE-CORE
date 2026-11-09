import type { Ds4PowertrainDemandResearchInputV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmEpisodeResearchInputV1 } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';

/** Fresh deep copies so independent factory calls cannot share mutable state. */
export function clonePowertrainFixtureInput(
  input: Ds4PowertrainDemandResearchInputV1,
): Ds4PowertrainDemandResearchInputV1 {
  return structuredClone(input);
}

export function cloneA1FixtureInput(input: Ds4RpmEpisodeResearchInputV1): Ds4RpmEpisodeResearchInputV1 {
  return structuredClone(input);
}
