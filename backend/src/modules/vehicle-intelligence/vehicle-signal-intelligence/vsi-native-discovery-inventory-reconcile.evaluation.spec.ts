import { assessNativeDiscoveryInventoryReconcileNeed } from './vsi-native-discovery-inventory-reconcile.evaluation';
import { buildCanonicalEmptyNativeDiscoveryInventoryDbJson } from './vsi-native-discovery-inventory.db.util';

describe('assessNativeDiscoveryInventoryReconcileNeed', () => {
  const baseProfile = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    providerIdentity: 'DIMO',
    evaluatedAt: new Date('2026-11-01T12:00:00.000Z'),
    updatedAt: new Date('2026-11-01T12:00:00.000Z'),
    lastMaterializedSourceTimestamp: new Date('2026-11-01T11:00:00.000Z'),
  };

  afterEach(() => {
    delete process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
    delete process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED;
  });

  it('does not require reconcile when discovery axes are disabled', () => {
    const assessment = assessNativeDiscoveryInventoryReconcileNeed({
      ...baseProfile,
      nativeSignalDiscoveryInventory: buildCanonicalEmptyNativeDiscoveryInventoryDbJson(),
    });
    expect(assessment.needsReconcile).toBe(false);
  });

  it('flags missing inventory when snapshot axis enabled', () => {
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    const assessment = assessNativeDiscoveryInventoryReconcileNeed({
      ...baseProfile,
      nativeSignalDiscoveryInventory: buildCanonicalEmptyNativeDiscoveryInventoryDbJson(),
    });
    expect(assessment.missingInventory).toBe(true);
    expect(assessment.snapshotAxisNeedsRefresh).toBe(true);
    expect(assessment.needsReconcile).toBe(true);
  });

  it('flags stale inventory when profile is fresher than inventory evaluatedAt', () => {
    process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED = 'true';
    const assessment = assessNativeDiscoveryInventoryReconcileNeed({
      ...baseProfile,
      evaluatedAt: new Date('2026-11-03T12:00:00.000Z'),
      updatedAt: new Date('2026-11-03T12:00:00.000Z'),
      nativeSignalDiscoveryInventory: {
        contractVersion: 'vsi-native-signal-discovery-v1',
        scope: {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          providerSourceLinkId: 'link-1',
          providerIdentity: 'DIMO',
        },
        evaluatedAt: '2026-11-01T12:00:00.000Z',
        entries: [
          {
            providerNativeSignalName: 'speed',
            aliasVerdict: 'UNKNOWN_SIGNAL',
            canonicalSignalKey: null,
            snapshot: {
              evaluation: { state: 'EVALUATED_OBSERVED' },
              lastObservedAt: '2026-11-01T11:00:00.000Z',
              lastSourceTimestamp: '2026-11-01T11:00:00.000Z',
            },
            historical: {
              evaluation: { state: 'EVALUATED_NOT_OBSERVED' },
              firstSeenAt: null,
              lastSeenAt: null,
              sampleMetadata: {
                windowStartAt: null,
                windowEndAt: null,
                pointCount: null,
                tripCountWithPoints: null,
                readCapApplied: null,
              },
            },
            ingestionLimitations: [],
          },
        ],
        profileLimitations: [],
      },
    });
    expect(assessment.staleInventory).toBe(true);
    expect(assessment.needsReconcile).toBe(true);
  });

  it('flags historical axis refresh for legacy SNAPSHOT placeholder on historical axis', () => {
    process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED = 'true';
    const assessment = assessNativeDiscoveryInventoryReconcileNeed({
      ...baseProfile,
      nativeSignalDiscoveryInventory: {
        contractVersion: 'vsi-native-signal-discovery-v1',
        scope: {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          providerSourceLinkId: 'link-1',
          providerIdentity: 'DIMO',
        },
        evaluatedAt: '2026-11-03T12:00:00.000Z',
        entries: [
          {
            providerNativeSignalName: 'speed',
            aliasVerdict: 'UNKNOWN_SIGNAL',
            canonicalSignalKey: null,
            snapshot: {
              evaluation: { state: 'EVALUATED_OBSERVED' },
              lastObservedAt: '2026-11-01T11:00:00.000Z',
              lastSourceTimestamp: '2026-11-01T11:00:00.000Z',
            },
            historical: {
              evaluation: {
                state: 'NOT_EVALUATED',
                notEvaluatedReason: 'SNAPSHOT_EXTRACTOR_NOT_RUN',
              },
              firstSeenAt: null,
              lastSeenAt: null,
              sampleMetadata: {
                windowStartAt: null,
                windowEndAt: null,
                pointCount: null,
                tripCountWithPoints: null,
                readCapApplied: null,
              },
            },
            ingestionLimitations: [],
          },
        ],
        profileLimitations: [],
      },
    });
    expect(assessment.hfAxisNeedsRefresh).toBe(true);
    expect(assessment.snapshotAxisNeedsRefresh).toBe(false);
  });
});
