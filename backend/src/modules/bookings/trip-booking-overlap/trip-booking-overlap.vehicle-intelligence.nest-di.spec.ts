import { MODULE_METADATA } from '@nestjs/common/constants';
import { TripBookingOverlapModule } from './trip-booking-overlap.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';

/**
 * Static module-graph checks only — runtime compile lives in
 * `trip-booking-overlap.vehicle-intelligence.bootstrap.spec.ts`.
 */
describe('VehicleIntelligenceModule — TripBookingOverlap import graph', () => {
  it('imports TripBookingOverlapModule without importing BookingsModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, VehicleIntelligenceModule) as
      | unknown[]
      | undefined;
    expect(imports).toEqual(expect.arrayContaining([TripBookingOverlapModule]));
    const importNames = (imports ?? []).map((entry) =>
      typeof entry === 'function' ? entry.name : String(entry),
    );
    expect(importNames.some((name) => name.includes('BookingsModule'))).toBe(false);
  });
});
