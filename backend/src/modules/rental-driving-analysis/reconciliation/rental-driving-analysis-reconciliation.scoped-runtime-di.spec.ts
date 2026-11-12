import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';
import { DrivingAnalysisReconciliationService } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/driving-analysis-reconciliation.service';
import { DrivingAnalysisInitService } from '@modules/vehicle-intelligence/driving-analysis-init/driving-analysis-init.service';
import { DrivingIntelligenceJobDispatcherService } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { DrivingIntelligenceJobRepository } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.repository';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis.module';
import { RentalDrivingAnalysisReconciliationPortAdapter } from './rental-driving-analysis-reconciliation.adapter';
import { rentalDrivingAnalysisReconciliationPortProviders } from './rental-driving-analysis-reconciliation.providers';
import { PrismaService } from '@shared/database/prisma.service';
describe('RentalDrivingAnalysisReconciliationPort — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const overlapPort = {
      findFirstOverlapForTrip: jest.fn(),
      findOverlapsForVehicleWindow: jest.fn(),
      loadDriverPoolsForBookings: jest.fn(),
      loadDriverPoolForBooking: jest.fn(),
      loadBookingAttributionContext: jest.fn(),
      findPickupHandoverProofForTrip: jest.fn(),
      resolveBookingVehicleForOrganization: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        ...rentalDrivingAnalysisReconciliationPortProviders,
        {
          provide: PrismaService,
          useValue: {
            booking: { findMany: jest.fn(), findFirst: jest.fn() },
            vehicleTrip: { findFirst: jest.fn() },
            drivingAnalysisRun: { findFirst: jest.fn() },
          },
        },
        {
          provide: DrivingAnalysisInitService,
          useValue: { initializeForCompletedTrip: jest.fn() },
        },
        {
          provide: DrivingIntelligenceJobDispatcherService,
          useValue: { enqueue: jest.fn() },
        },
        {
          provide: DrivingIntelligenceJobRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: TRIP_BOOKING_OVERLAP_PORT,
          useValue: overlapPort,
        },
        DrivingAnalysisReconciliationService,
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('RentalDrivingAnalysisModule exports RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalDrivingAnalysisModule) as
      | unknown[]
      | undefined;
    expect(exports).toContain(RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT);
  });

  it('resolves port to RentalDrivingAnalysisReconciliationPortAdapter', () => {
    const port = moduleRef.get(RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT);
    const adapter = moduleRef.get(RentalDrivingAnalysisReconciliationPortAdapter);
    expect(port).toBe(adapter);
  });

  it('injects port into DrivingAnalysisReconciliationService', () => {
    const port = moduleRef.get(RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT);
    const reconciliation = moduleRef.get(DrivingAnalysisReconciliationService);
    expect((reconciliation as unknown as { rentalReconciliation: unknown }).rentalReconciliation).toBe(
      port,
    );
  });
});
