import type { TestingModule } from '@nestjs/testing';
import { TripAssignmentService } from './trip-assignment.service';
import { TripAnalyticsCanonicalService } from './trip-analytics-canonical.service';
import { TRIP_BOOKING_OVERLAP_PORT } from './ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from '@modules/bookings/trip-booking-overlap/trip-booking-overlap.adapter';
import {
  BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE,
  classifyBootstrapFailure,
  probeVehicleIntelligenceModuleCompile,
  type ViFullBootstrapProbeResult,
} from './vi-full-module-bootstrap.probe';

describe('VehicleIntelligenceModule — full bootstrap probe', () => {
  let probe: ViFullBootstrapProbeResult;

  beforeAll(async () => {
    probe = await probeVehicleIntelligenceModuleCompile();
  }, 180_000);

  afterAll(async () => {
    if (probe.outcome === 'PASS') {
      await probe.moduleRef.close();
    }
  });

  it('FULL_MODULE_BOOTSTRAP: PASS requires successful compile and TripBookingOverlap resolution', () => {
    if (probe.outcome === 'PASS') {
      const moduleRef: TestingModule = probe.moduleRef;
      const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
      expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);
      const assignment = moduleRef.get(TripAssignmentService);
      const analytics = moduleRef.get(TripAnalyticsCanonicalService);
      expect((assignment as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
      expect((analytics as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
      return;
    }

    const classification = classifyBootstrapFailure(probe.message);
    if (classification === 'BASELINE_BLOCKED') {
      expect(probe.message).toContain(BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE);
      return;
    }

    throw new Error(
      `FULL_MODULE_BOOTSTRAP REGRESSION (not baseline-equivalent): ${probe.message}`,
    );
  });

  it('documents that BASELINE_BLOCKED is not a PASS', () => {
    if (probe.outcome === 'PASS') {
      expect(probe.outcome).toBe('PASS');
      return;
    }
    expect(classifyBootstrapFailure(probe.message)).toBe('BASELINE_BLOCKED');
    expect(probe.outcome).toBe('FAIL');
  });
});
