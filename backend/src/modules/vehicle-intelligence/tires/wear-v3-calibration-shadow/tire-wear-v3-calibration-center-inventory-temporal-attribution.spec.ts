import { TireOdometerAnchorStatus, TirePosition } from '@prisma/client';
import {
  pickLatestSetupMeasurementForWheel,
  resolveMeasurementToTireAttribution,
} from './tire-wear-v3-calibration-center-inventory-temporal-attribution';

const mountPeriod = {
  id: 'mp-1',
  installedAt: new Date('2026-01-01T00:00:00.000Z'),
  removedAt: null,
  installedOdometerKm: 1000,
  odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
};

describe('tire-wear-v3-calibration-center-inventory-temporal-attribution', () => {
  it('pickLatestSetupMeasurementForWheel prefers latest row with tread at wheel', () => {
    const rows = [
      {
        measuredAt: new Date('2026-06-01'),
        frontLeftMm: null,
        frontRightMm: 7,
        rearLeftMm: null,
        rearRightMm: null,
      },
      {
        measuredAt: new Date('2026-05-01'),
        frontLeftMm: 5.5,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      },
    ];
    expect(pickLatestSetupMeasurementForWheel(rows, 'FL')?.frontLeftMm).toBe(5.5);
    expect(pickLatestSetupMeasurementForWheel(rows, 'FR')?.frontRightMm).toBe(7);
  });

  it('confirms attribution when history proves tire at wheel at measuredAt', () => {
    const measuredAt = new Date('2026-03-15T00:00:00.000Z');
    const tires = [
      {
        id: 'tire-a',
        mountedAt: new Date('2026-01-01T00:00:00.000Z'),
        dismountedAt: null,
        installedPosition: TirePosition.FRONT_LEFT,
      },
    ];
    const result = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: [],
      positionHistory: [
        {
          tireId: 'tire-a',
          toPosition: TirePosition.FRONT_LEFT,
          changedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      tires,
      currentPhysicalTireId: 'tire-a',
    });
    expect(result.status).toBe('CONFIRMED');
    expect(result.attributedPhysicalTireId).toBe('tire-a');
    expect(result.linksMeasurementToCurrentMountedTire).toBe(true);
  });

  it('does not link measurement to current tire after replacement', () => {
    const measuredAt = new Date('2026-02-01T00:00:00.000Z');
    const replaceAt = new Date('2026-04-01T00:00:00.000Z');
    const tires = [
      {
        id: 'tire-old',
        mountedAt: new Date('2026-01-01T00:00:00.000Z'),
        dismountedAt: replaceAt,
        installedPosition: TirePosition.FRONT_LEFT,
      },
      {
        id: 'tire-new',
        mountedAt: replaceAt,
        dismountedAt: null,
        installedPosition: TirePosition.FRONT_LEFT,
      },
    ];
    const history = [
      {
        tireId: 'tire-old',
        toPosition: TirePosition.FRONT_LEFT,
        changedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        tireId: 'tire-new',
        toPosition: TirePosition.FRONT_LEFT,
        changedAt: replaceAt,
      },
    ];
    const result = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: history.map((h) => ({ changedAt: h.changedAt })),
      positionHistory: history,
      tires,
      currentPhysicalTireId: 'tire-new',
    });
    expect(result.status).toBe('CONFIRMED');
    expect(result.attributedPhysicalTireId).toBe('tire-old');
    expect(result.linksMeasurementToCurrentMountedTire).toBe(false);
  });

  it('marks rotation after measurement as not linked to current assignment', () => {
    const measuredAt = new Date('2026-02-01T00:00:00.000Z');
    const rotationAt = new Date('2026-05-01T00:00:00.000Z');
    const tires = [
      {
        id: 'tire-a',
        mountedAt: new Date('2026-01-01T00:00:00.000Z'),
        dismountedAt: null,
        installedPosition: TirePosition.FRONT_LEFT,
      },
    ];
    const history = [
      {
        tireId: 'tire-a',
        toPosition: TirePosition.FRONT_LEFT,
        changedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        tireId: 'tire-a',
        toPosition: TirePosition.REAR_LEFT,
        changedAt: rotationAt,
      },
    ];
    const atMeasure = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: history.map((h) => ({ changedAt: h.changedAt })),
      positionHistory: history,
      tires,
      currentPhysicalTireId: null,
    });
    expect(atMeasure.status).toBe('CONFIRMED');
    expect(atMeasure.attributedPhysicalTireId).toBe('tire-a');
    expect(atMeasure.linksMeasurementToCurrentMountedTire).toBe(false);
  });

  it('returns NOT_ATTRIBUTABLE for measurement before current mount period', () => {
    const measuredAt = new Date('2025-12-01T00:00:00.000Z');
    const result = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: [],
      positionHistory: [],
      tires: [
        {
          id: 'tire-a',
          mountedAt: new Date('2026-01-01T00:00:00.000Z'),
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
      ],
      currentPhysicalTireId: 'tire-a',
    });
    expect(result.status).toBe('NOT_ATTRIBUTABLE');
  });

  it('returns NOT_ATTRIBUTABLE when rotation occurred but history is missing', () => {
    const measuredAt = new Date('2026-03-01T00:00:00.000Z');
    const result = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: [{ changedAt: new Date('2026-02-01T00:00:00.000Z') }],
      positionHistory: [],
      tires: [
        {
          id: 'tire-a',
          mountedAt: new Date('2026-01-01T00:00:00.000Z'),
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
      ],
      currentPhysicalTireId: 'tire-a',
    });
    expect(result.status).toBe('NOT_ATTRIBUTABLE');
  });

  it('returns AMBIGUOUS attribution when multiple tires occupy the wheel at instant', () => {
    const measuredAt = new Date('2026-03-01T00:00:00.000Z');
    const result = resolveMeasurementToTireAttribution({
      wheel: 'FL',
      measuredAt,
      mountPeriodAtMeasurement: mountPeriod,
      rotationEvents: [
        { changedAt: new Date('2026-01-01T00:00:00.000Z') },
        { changedAt: new Date('2026-02-01T00:00:00.000Z') },
      ],
      positionHistory: [
        {
          tireId: 't1',
          toPosition: TirePosition.FRONT_LEFT,
          changedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          tireId: 't2',
          toPosition: TirePosition.FRONT_LEFT,
          changedAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ],
      tires: [
        {
          id: 't1',
          mountedAt: new Date('2026-01-01T00:00:00.000Z'),
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
        {
          id: 't2',
          mountedAt: new Date('2026-02-01T00:00:00.000Z'),
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
      ],
      currentPhysicalTireId: 't2',
    });
    expect(result.status).toBe('AMBIGUOUS');
  });
});
