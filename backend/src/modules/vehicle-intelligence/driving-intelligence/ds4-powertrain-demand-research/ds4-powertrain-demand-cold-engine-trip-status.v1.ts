import type {
  Ds4ColdEngineSubtypeAssessabilityV1,
  Ds4PowertrainDemandTripStatus,
} from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4ColdEngineProxyKindV1 } from './ds4-powertrain-demand-research.contract.v1';

export function resolveColdEngineTripStatus(input: {
  readonly candidateCount: number;
  readonly subtypeAssessability: Record<Ds4ColdEngineProxyKindV1, Ds4ColdEngineSubtypeAssessabilityV1>;
}): Ds4PowertrainDemandTripStatus {
  if (input.candidateCount > 0) {
    return 'COMPUTED';
  }
  const statuses = Object.values(input.subtypeAssessability).map((s) => s.status);
  const allNotAssessable = statuses.every((s) => s === 'NOT_ASSESSABLE');
  if (allNotAssessable) {
    return 'COMPUTED';
  }
  const anyAssessable = statuses.some((s) => s === 'ASSESSABLE');
  if (anyAssessable) {
    return 'NOT_OBSERVED';
  }
  return 'COMPUTED';
}
