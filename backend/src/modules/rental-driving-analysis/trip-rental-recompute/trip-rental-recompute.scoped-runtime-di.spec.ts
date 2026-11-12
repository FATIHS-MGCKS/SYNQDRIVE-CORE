import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { TRIP_RENTAL_RECOMPUTE_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-rental-recompute.port';
import { TripPostFinalizeAnalysisProducer } from '@modules/vehicle-intelligence/driving-analysis-init/trip-post-finalize-analysis.producer';
import { TripAssignmentService } from '@modules/vehicle-intelligence/trips/trip-assignment.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis.module';
import { tripRentalRecomputePortProviders } from './trip-rental-recompute.providers';
import { TripRentalRecomputePortAdapter } from './trip-rental-recompute.adapter';
import { RentalDrivingAnalysisRecomputeTriggerService } from '../rental-driving-analysis-recompute.trigger';

describe('TripRentalRecomputePort — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const triggerMock = {
      enqueueForTrip: jest.fn().mockResolvedValue({ enqueued: true }),
      enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: true }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        ...tripRentalRecomputePortProviders,
        {
          provide: RentalDrivingAnalysisRecomputeTriggerService,
          useValue: triggerMock,
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('RentalDrivingAnalysisModule exports TRIP_RENTAL_RECOMPUTE_PORT', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalDrivingAnalysisModule) as
      | unknown[]
      | undefined;
    expect(exports).toContain(TRIP_RENTAL_RECOMPUTE_PORT);
  });

  it('resolves canonical port providers to TripRentalRecomputePortAdapter', () => {
    const port = moduleRef.get(TRIP_RENTAL_RECOMPUTE_PORT);
    const adapter = moduleRef.get(TripRentalRecomputePortAdapter);
    expect(port).toBe(adapter);
    expect(port).toBeInstanceOf(TripRentalRecomputePortAdapter);
  });
});

describe('TripRentalRecomputePort — Core services optional injection', () => {
  it('TripAssignmentService and TripPostFinalizeAnalysisProducer accept optional port', () => {
    const recompute = {
      notifyTripCompleted: jest.fn(),
      notifyBookingAssignmentCorrected: jest.fn(),
    };
    const assignment = new TripAssignmentService(
      { vehicle: { findUnique: jest.fn() } } as any,
      { findFirstOverlapForTrip: jest.fn() } as any,
      undefined,
      recompute as any,
    );
    const producer = new TripPostFinalizeAnalysisProducer(
      { initializeForCompletedTrip: jest.fn() } as any,
      recompute as any,
    );
    expect(assignment).toBeDefined();
    expect(producer).toBeDefined();
  });
});
