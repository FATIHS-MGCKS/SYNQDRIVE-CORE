import { mapManualIntervalsToPositions } from './manual-interval.adapter';

describe('mapManualIntervalsToPositions', () => {
  it('prefers manufacturer inspection intervals over generic fields', () => {
    const positions = mapManualIntervalsToPositions({
      serviceIntervalManufacturerKm: 30_000,
      serviceIntervalManufacturerMonths: 24,
      serviceIntervalKm: 10_000,
      serviceIntervalMonths: 6,
      oilChangeIntervalKm: null,
      oilChangeIntervalMonths: null,
      lastServiceDate: null,
      lastServiceOdometerKm: null,
      lastOilChangeDate: null,
      lastOilChangeOdometerKm: null,
    });
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      kind: 'INSPECTION',
      intervalKm: 30_000,
      intervalMonths: 24,
    });
  });
});
