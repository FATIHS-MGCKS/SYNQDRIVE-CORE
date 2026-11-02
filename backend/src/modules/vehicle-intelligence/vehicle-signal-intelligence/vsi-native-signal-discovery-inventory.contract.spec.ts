import {
  VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES,
  VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION,
  VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
  assertNativeDiscoveryInventoryScopeMatch,
  emptyNativeSignalDiscoveryInventory,
  truncateNativeSignalDiscoveryInventory,
  validateNativeSignalDiscoveryInventoryWellFormed,
  type VsiNativeSignalDiscoveryInventoryEntryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
  axisAllowsPositiveObservationClaim,
} from './vsi-native-signal-discovery-evaluation-state';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const LINK = '71b75519-0000-4000-8000-000000000001';

function baseScope() {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    providerSourceLinkId: LINK,
    providerIdentity: 'DIMO',
  };
}

function sampleEntry(
  overrides: Partial<VsiNativeSignalDiscoveryInventoryEntryV1> = {},
): VsiNativeSignalDiscoveryInventoryEntryV1 {
  return {
    providerNativeSignalName: 'powertrainCombustionEngineECT',
    aliasVerdict: 'UNKNOWN_SIGNAL',
    canonicalSignalKey: null,
    snapshot: {
      evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
      lastObservedAt: '2026-10-27T10:00:00.000Z',
      lastSourceTimestamp: '2026-10-27T10:00:00.000Z',
    },
    historical: {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
      },
      firstSeenAt: '2026-08-08T16:54:01.556Z',
      lastSeenAt: '2026-11-02T07:11:36.000Z',
      sampleMetadata: {
        windowStartAt: '2026-08-08T16:54:01.556Z',
        windowEndAt: '2026-11-02T07:11:36.000Z',
        pointCount: 100,
        tripCountWithPoints: 3,
        readCapApplied: 12000,
      },
    },
    ingestionLimitations: ['HF_MIRROR_SIGNAL_SET_BOUNDED'],
    ...overrides,
  };
}

describe('vsi-native-signal-discovery-inventory.contract', () => {
  it('uses contract version vsi-native-signal-discovery-v1', () => {
    expect(VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION).toBe(
      'vsi-native-signal-discovery-v1',
    );
  });

  it('enforces tenant + link scope match', () => {
    const inv = emptyNativeSignalDiscoveryInventory(baseScope(), new Date());
    assertNativeDiscoveryInventoryScopeMatch({
      inventory: inv,
      ...baseScope(),
    });
    expect(() =>
      assertNativeDiscoveryInventoryScopeMatch({
        inventory: inv,
        ...baseScope(),
        vehicleId: 'other-vehicle',
      }),
    ).toThrow(/vehicleId mismatch/);
  });

  it('truncates stable-sorted inventory and adds limitation', () => {
    const entries = ['z_signal', 'a_signal', 'm_signal'].map((name) =>
      sampleEntry({ providerNativeSignalName: name }),
    );
    const inv = {
      ...emptyNativeSignalDiscoveryInventory(baseScope(), new Date()),
      entries,
    };
    const truncated = truncateNativeSignalDiscoveryInventory(inv, 2);
    expect(truncated.entries).toHaveLength(2);
    expect(truncated.entries.map((e) => e.providerNativeSignalName)).toEqual([
      'a_signal',
      'm_signal',
    ]);
    expect(truncated.profileLimitations).toContain(
      VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION,
    );
  });

  it('rejects inventory exceeding max entries', () => {
    const entries = Array.from({ length: VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES + 1 }, (_, i) =>
      sampleEntry({ providerNativeSignalName: `sig_${i}` }),
    );
    const inv = {
      ...emptyNativeSignalDiscoveryInventory(baseScope(), new Date()),
      entries,
    };
    expect(() => validateNativeSignalDiscoveryInventoryWellFormed(inv)).toThrow(/exceed/);
  });

  it('tri-state: NOT_EVALUATED requires reason; absence ≠ unsupported claim', () => {
    const notEval = {
      state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
      notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.DISCOVERY_FEATURE_DISABLED,
    };
    expect(axisAllowsPositiveObservationClaim(notEval)).toBe(false);
    const observed = { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED };
    expect(axisAllowsPositiveObservationClaim(observed)).toBe(true);
    const notObserved = { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED };
    expect(axisAllowsPositiveObservationClaim(notObserved)).toBe(false);
  });
});
