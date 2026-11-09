import type { FsdP6cPlanCompletenessV1 } from '../p6c/fsd-p6c-fleet-plan.v1';
import type { FsdP6cVehicleDiscoveryOutcomeV1 } from '../p6c/fsd-p6c-fsd3-fsd4-chain-guard.v1';
import { classifyFsdP6cVehicleDiscoveryOutcomeV1 } from '../p6c/fsd-p6c-fsd3-fsd4-chain-guard.v1';

export type FsdP6dFleetDiscoveryClassificationV1 =
  | 'FULL_DISCOVERY_SUCCESS'
  | 'PARTIAL_DISCOVERY'
  | 'FAILED_DISCOVERY'
  | 'INCOMPLETE_DISCOVERY';

export function classifyFsdP6dFleetDiscoveryOutcomeV1(input: {
  fsd3TerminalStatus: string;
  fsd4TerminalStatus: string;
  planCompleteness: FsdP6cPlanCompletenessV1;
  allExecutable: boolean;
}): FsdP6dFleetDiscoveryClassificationV1 {
  const base: FsdP6cVehicleDiscoveryOutcomeV1 = classifyFsdP6cVehicleDiscoveryOutcomeV1({
    fsd3TerminalStatus: input.fsd3TerminalStatus,
    fsd4TerminalStatus: input.fsd4TerminalStatus,
  });

  if (input.fsd3TerminalStatus === 'FAILED' || input.fsd4TerminalStatus === 'FAILED') {
    return 'FAILED_DISCOVERY';
  }
  if (input.planCompleteness === 'BUDGET_TRUNCATED' || !input.allExecutable) {
    return 'PARTIAL_DISCOVERY';
  }
  if (input.planCompleteness === 'CATALOG_PENDING') {
    return 'INCOMPLETE_DISCOVERY';
  }
  if (base === 'FULL_DISCOVERY_SUCCESS') {
    return 'FULL_DISCOVERY_SUCCESS';
  }
  return 'INCOMPLETE_DISCOVERY';
}
