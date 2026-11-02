import { resolveSnapshotNativeDiscoveryStateAttributed } from './vsi-snapshot-discovery-attribution';
import type { VsiLatestStateSnapshot, VsiSourceLinkRow } from './vsi-readonly-composer.types';

function link(id: string): VsiSourceLinkRow {
  return {
    id,
    provider: 'DIMO',
    isActive: true,
    metadata: null,
    consentId: 'consent-1',
  };
}

function latestState(bindingId: string | null): VsiLatestStateSnapshot {
  const ts = new Date('2026-10-15T12:00:00.000Z');
  return {
    vehicleId: 'veh-1',
    providerBindingId: bindingId,
    providerSource: 'DIMO',
    lvBatteryVoltage: null,
    evSoc: null,
    online: true,
    sourceTimestamp: ts,
    providerFetchedAt: ts,
    updatedAt: ts,
    rawPayloadJson: { speed: { value: 10, timestamp: ts.toISOString() } },
    obdDtcList: null,
    lastDtcSuccessfulCheckAt: null,
  };
}

describe('resolveSnapshotNativeDiscoveryStateAttributed', () => {
  it('single active link with matching binding is attributed', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState('link-a'),
        link: link('link-a'),
        activeLinkCount: 1,
      }),
    ).toBe(true);
  });

  it('multiple active links with unique matching binding is attributed', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState('link-a'),
        link: link('link-a'),
        activeLinkCount: 2,
      }),
    ).toBe(true);
  });

  it('multiple active links with missing binding is not attributed', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState(null),
        link: link('link-a'),
        activeLinkCount: 2,
      }),
    ).toBe(false);
  });

  it('missing binding is not attributed even with one active link', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState(null),
        link: link('link-a'),
        activeLinkCount: 1,
      }),
    ).toBe(false);
  });

  it('binding mismatch is not attributed', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState('link-b'),
        link: link('link-a'),
        activeLinkCount: 1,
      }),
    ).toBe(false);
  });

  it('inactive superseded link row still fails when binding points elsewhere', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: latestState('link-active'),
        link: { ...link('link-superseded'), isActive: false },
        activeLinkCount: 1,
      }),
    ).toBe(false);
  });

  it('null latest state is not attributed', () => {
    expect(
      resolveSnapshotNativeDiscoveryStateAttributed({
        latestState: null,
        link: link('link-a'),
        activeLinkCount: 1,
      }),
    ).toBe(false);
  });
});
