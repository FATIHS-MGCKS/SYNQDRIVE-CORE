import {
  APDS_V3_CONSUMER_DEMAND_REGISTRY_V1,
  APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
  listSnapshotBackedConsumers,
} from './consumer-demand-registry.v1';

describe('consumer-demand-registry.v1', () => {
  it('exposes stable version', () => {
    expect(APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION).toBe(
      'APDS_V3_CONSUMER_DEMAND_V1',
    );
  });

  it('lists only SNAPSHOT-backed consumers for demand calculus', () => {
    const snap = listSnapshotBackedConsumers();
    expect(snap.every((c) => c.dataSource === 'DIMO_SNAPSHOT')).toBe(true);
    expect(snap.some((c) => c.consumerId === 'LV_BATTERY_V2')).toBe(true);
  });

  it('keeps UNKNOWN freshness where not proven', () => {
    const p2c = APDS_V3_CONSUMER_DEMAND_REGISTRY_V1.find(
      (c) => c.consumerId === 'VSI_P2C_PROVIDER_SOURCE',
    );
    expect(p2c?.freshness.kind).toBe('UNKNOWN');
  });
});
