import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT } from '@modules/vehicle-intelligence/driving-intelligence-jobs/ports/rental-driving-analysis-recompute-job-handler.port';
import { DrivingIntelligenceJobHandlerRegistry } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.handler.registry';
import { RentalDrivingAnalysisModule } from './rental-driving-analysis.module';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { rentalDrivingAnalysisRecomputeJobHandlerPortProviders } from './rental-driving-analysis-recompute-job-handler.providers';

describe('RentalDrivingAnalysisRecomputeJobHandlerPort — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        DrivingIntelligenceJobHandlerRegistry,
        ...rentalDrivingAnalysisRecomputeJobHandlerPortProviders,
        RentalDrivingAnalysisRecomputeJobHandler,
        {
          provide: RentalDrivingAnalysisService,
          useValue: { recomputeForBooking: jest.fn() },
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('RentalDrivingAnalysisModule exports RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalDrivingAnalysisModule) as
      | unknown[]
      | undefined;
    expect(exports).toContain(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT);
  });

  it('resolves port to the same instance as RentalDrivingAnalysisRecomputeJobHandler', () => {
    const port = moduleRef.get(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT);
    const handler = moduleRef.get(RentalDrivingAnalysisRecomputeJobHandler);
    expect(port).toBe(handler);
  });

  it('injects port into DrivingIntelligenceJobHandlerRegistry for rental dispatch', async () => {
    const handler = moduleRef.get(RentalDrivingAnalysisRecomputeJobHandler);
    const spy = jest.spyOn(handler, 'handle').mockResolvedValue(undefined);
    const registry = moduleRef.get(DrivingIntelligenceJobHandlerRegistry);
    registry.onModuleInit();

    const job = {
      id: 'job-di',
      jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      analysisRunId: 'run-1',
      correlationId: 'rental-recompute:book-1:INPUT_OR_MODEL_CHANGED',
    } as any;

    await registry.dispatch(job);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(job);
  });
});
