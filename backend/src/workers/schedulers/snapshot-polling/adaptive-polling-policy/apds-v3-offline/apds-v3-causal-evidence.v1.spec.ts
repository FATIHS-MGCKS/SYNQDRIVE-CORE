import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import { validateCausalEvidenceAtDecision } from './apds-v3-causal-evidence.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

function base(over: Partial<ApdsV3OfflinePolicyInput> = {}): ApdsV3OfflinePolicyInput {
  const t = 1_700_000_000_000;
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    decisionAtMs: t,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: t - 120_000,
    lastLvProviderSourceMs: t - 60_000,
    lastProviderFetchedAtMs: t - 55_000,
    lastTopLevelProviderSourceMs: t - 58_000,
    profileClass: 'STABLE_PERIODIC',
    medianIntervalMs: 600_000,
    providerGapOpen: false,
    providerWakeOrReconnect: false,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: false,
    consumerDemandRevision: APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
    signalProfileRevision: 'rev1',
    signalProfileRevisionEffectiveAtMs: t - 300_000,
    ...over,
  };
}

describe('apds-v3-causal-evidence.v1', () => {
  it('rejects future timestamps', () => {
    const t = 1_700_000_000_000;
    const v = validateCausalEvidenceAtDecision(
      base({ lastLvProviderSourceMs: t + 1 }),
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('FUTURE_TIMESTAMP_LEAK');
  });

  it('rejects NaN decision time', () => {
    const v = validateCausalEvidenceAtDecision(base({ decisionAtMs: Number.NaN }));
    expect(v.ok).toBe(false);
  });

  it('HIGH requires coverage verification and availability', () => {
    const t = 1_700_000_000_000;
    const v = validateCausalEvidenceAtDecision(
      base({
        p2cObservationId: 'obs-1',
        p2cObservationAvailableAtMs: t - 1000,
        p2cObservationCoverageVerified: true,
        p2cBoundOrganizationId: 'org-1',
        p2cBoundVehicleId: 'veh-1',
        p2cBoundProviderSourceLinkId: 'link-1',
      }),
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.observationQuality).toBe('HIGH');
  });

  it('P2C advance claim requires binding and data source timestamp', () => {
    const t = 1_700_000_000_000;
    const v = validateCausalEvidenceAtDecision(
      base({
        p2cTopLevelAdvanceKnown: true,
        p2cObservationId: 'obs-1',
        p2cObservationAvailableAtMs: t - 1000,
        p2cDataSourceTimestampMs: t - 2000,
        p2cBoundOrganizationId: 'wrong-org',
        p2cBoundVehicleId: 'veh-1',
        p2cBoundProviderSourceLinkId: 'link-1',
      }),
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('P2C_ORG_BINDING_MISMATCH');
  });

  it.each([
    ['P2C_ORG_BINDING_MISSING', { p2cBoundOrganizationId: null }],
    ['P2C_VEHICLE_BINDING_MISSING', { p2cBoundVehicleId: null }],
    ['P2C_SOURCE_LINK_BINDING_MISSING', { p2cBoundProviderSourceLinkId: null }],
  ] as const)('missing %s fails closed', (reason, partial) => {
    const t = 1_700_000_000_000;
    const v = validateCausalEvidenceAtDecision(
      base({
        p2cTopLevelAdvanceKnown: true,
        p2cObservationId: 'obs-1',
        p2cObservationAvailableAtMs: t - 1000,
        p2cDataSourceTimestampMs: t - 2000,
        p2cBoundOrganizationId: 'org-1',
        p2cBoundVehicleId: 'veh-1',
        p2cBoundProviderSourceLinkId: 'link-1',
        ...partial,
      }),
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe(reason);
  });
});
