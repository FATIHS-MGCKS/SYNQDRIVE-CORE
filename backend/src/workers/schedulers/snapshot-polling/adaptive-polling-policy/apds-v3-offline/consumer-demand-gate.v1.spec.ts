import {
  APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
} from './consumer-demand-registry.v1';
import {
  evaluateConsumerDemandGate,
  validateConsumerDemandRevision,
} from './consumer-demand-gate.v1';

describe('consumer-demand-gate.v1', () => {
  const ev = {
    decisionAtMs: 1_700_000_000_000,
    strictLvProviderSourceMs: 1_700_000_000_000 - 60_000,
    topLevelProviderSourceMs: 1_700_000_000_000 - 55_000,
    tripFsmState: 'RESTING' as const,
  };

  it('rejects revision mismatch', () => {
    expect(validateConsumerDemandRevision('WRONG')).toBe(false);
    const g = evaluateConsumerDemandGate('WRONG', ev);
    expect(g.blocksAuthoritativeSafeSkip).toBe(true);
    expect(g.reasons).toContain('CONSUMER_DEMAND_REVISION_MISMATCH');
  });

  it('blocks authoritative safe skip for UNKNOWN hard freshness consumers', () => {
    const g = evaluateConsumerDemandGate(APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION, ev);
    expect(g.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('HARD_UNKNOWN_FRESHNESS:TRIP_FSM_ORCHESTRATION')]),
    );
    expect(g.blocksAuthoritativeSafeSkip).toBe(true);
  });

  it('flags UNCALIBRATED LV assumption', () => {
    const g = evaluateConsumerDemandGate(APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION, ev);
    expect(g.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('UNCALIBRATED_NOT_CERTIFIED:LV_BATTERY_V2')]),
    );
  });

  it('missing LV evidence blocks skip', () => {
    const g = evaluateConsumerDemandGate(APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION, {
      ...ev,
      strictLvProviderSourceMs: null,
    });
    expect(g.reasons).toContain('MISSING_SIGNAL_EVIDENCE:LV_BATTERY_V2:STRICT_LV_PROVIDER_SOURCE');
  });
});
