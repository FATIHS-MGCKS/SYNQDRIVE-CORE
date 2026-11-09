import type { Ds4PowertrainDemandColdEngineResearchInputV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import {
  buildBoundPowertrainInput,
  positiveKickdownGrid,
} from '../../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';

describe('DBI P2-C1.5 B2 payload compile-time type safety', () => {
  it('rejects generic powertrain input without B2 reference fields', () => {
    const genericKickdown = buildBoundPowertrainInput({
      multichannelObservations: positiveKickdownGrid(),
    });
  // @ts-expect-error Generic B1 input lacks vehicleRpmReference required by B2 contract
    const _b2Only: Ds4PowertrainDemandColdEngineResearchInputV1 = genericKickdown;
    expect(genericKickdown.tripId).toBeDefined();
    expect(_b2Only).toBe(genericKickdown);
  });
});
