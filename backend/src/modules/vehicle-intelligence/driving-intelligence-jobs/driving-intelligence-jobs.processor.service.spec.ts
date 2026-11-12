import { DrivingIntelligenceJobProcessorService } from './driving-intelligence-jobs.processor.service';
import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs.handler.registry';
import {
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES,
  DrivingIntelligenceJobRetryableError,
  DrivingIntelligenceJobPermanentError,
} from './driving-intelligence-jobs.errors';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    jobType: 'DRIVING_ROUTE_ENRICH',
    analysisRunId: 'run-1',
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides,
  };
}

describe('DrivingIntelligenceJobProcessorService', () => {
  let repository: any;
  let handlerRegistry: any;
  let service: DrivingIntelligenceJobProcessorService;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      isTerminalStatus: jest.fn().mockReturnValue(false),
      markInProgress: jest.fn(),
      markCompleted: jest.fn(),
      markRetryScheduled: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    handlerRegistry = { dispatch: jest.fn() };
    service = new DrivingIntelligenceJobProcessorService(repository, handlerRegistry);
  });

  it('completes successful handler runs', async () => {
    repository.findById.mockResolvedValue(makeJob());
    repository.markInProgress.mockResolvedValue(makeJob({ attemptCount: 1 }));

    const outcome = await service.processPersistentJob('org-1', 'job-1');
    expect(outcome.result).toBe('completed');
    expect(repository.markCompleted).toHaveBeenCalledWith('job-1');
  });

  it('schedules retry for transient provider failures', async () => {
    repository.findById.mockResolvedValue(makeJob());
    repository.markInProgress.mockResolvedValue(makeJob({ attemptCount: 1 }));
    handlerRegistry.dispatch.mockRejectedValue(new Error('provider timeout'));

    const outcome = await service.processPersistentJob('org-1', 'job-1');
    expect(outcome.result).toBe('retry');
    expect(repository.markRetryScheduled).toHaveBeenCalledWith(
      'job-1',
      1,
      DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT,
      expect.any(String),
    );
  });

  it('dead-letters permanent validation failures without retry', async () => {
    repository.findById.mockResolvedValue(makeJob());
    repository.markInProgress.mockResolvedValue(makeJob({ attemptCount: 1 }));
    handlerRegistry.dispatch.mockRejectedValue(
      new DrivingIntelligenceJobPermanentError(
        DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED,
        'bad input',
      ),
    );

    const outcome = await service.processPersistentJob('org-1', 'job-1');
    expect(outcome.result).toBe('dead_letter');
    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      'job-1',
      DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED,
      'bad input',
    );
    expect(repository.markRetryScheduled).not.toHaveBeenCalled();
  });

  it('dead-letters after max attempts for transient errors', async () => {
    repository.findById.mockResolvedValue(makeJob());
    repository.markInProgress.mockResolvedValue(makeJob({ attemptCount: 3, maxAttempts: 3 }));
    handlerRegistry.dispatch.mockRejectedValue(new Error('provider 503'));

    const outcome = await service.processPersistentJob('org-1', 'job-1');
    expect(outcome.result).toBe('dead_letter');
    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      'job-1',
      DRIVING_INTELLIGENCE_JOB_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
      expect.any(String),
    );
  });

  describe('missing rental handler (fail-closed registry)', () => {
    function makeProcessorWithEmptyRegistry() {
      const registry = new DrivingIntelligenceJobHandlerRegistry();
      registry.onModuleInit();
      return new DrivingIntelligenceJobProcessorService(repository, registry);
    }

    it('schedules retry with HANDLER_TRANSIENT on first attempt', async () => {
      const processor = makeProcessorWithEmptyRegistry();
      repository.findById.mockResolvedValue(
        makeJob({
          id: 'job-rental',
          jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
          bookingId: 'book-1',
          maxAttempts: 3,
        }),
      );
      repository.markInProgress.mockResolvedValue(
        makeJob({
          id: 'job-rental',
          jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
          bookingId: 'book-1',
          attemptCount: 1,
          maxAttempts: 3,
        }),
      );

      const outcome = await processor.processPersistentJob('org-1', 'job-rental');

      expect(outcome).toEqual({
        result: 'retry',
        errorCode: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.HANDLER_TRANSIENT,
        message: expect.stringContaining('handler not configured'),
      });
      expect(repository.markRetryScheduled).toHaveBeenCalledWith(
        'job-rental',
        1,
        DRIVING_INTELLIGENCE_JOB_ERROR_CODES.HANDLER_TRANSIENT,
        expect.stringContaining('handler not configured'),
      );
      expect(repository.markCompleted).not.toHaveBeenCalled();
      expect(repository.markDeadLetter).not.toHaveBeenCalled();
    });

    it('dead-letters with MAX_ATTEMPTS_EXCEEDED on final attempt', async () => {
      const processor = makeProcessorWithEmptyRegistry();
      repository.findById.mockResolvedValue(
        makeJob({
          id: 'job-rental',
          jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
          bookingId: 'book-1',
          maxAttempts: 3,
        }),
      );
      repository.markInProgress.mockResolvedValue(
        makeJob({
          id: 'job-rental',
          jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
          bookingId: 'book-1',
          attemptCount: 3,
          maxAttempts: 3,
        }),
      );

      const outcome = await processor.processPersistentJob('org-1', 'job-rental');

      expect(outcome).toEqual({
        result: 'dead_letter',
        errorCode: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
        message: expect.stringContaining('handler not configured'),
      });
      expect(repository.markDeadLetter).toHaveBeenCalledWith(
        'job-rental',
        DRIVING_INTELLIGENCE_JOB_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
        expect.stringContaining('handler not configured'),
      );
      expect(repository.markCompleted).not.toHaveBeenCalled();
    });
  });

  it('re-throws retryable errors for BullMQ worker backoff', async () => {
    repository.findById.mockResolvedValue(makeJob());
    repository.markInProgress.mockResolvedValue(makeJob({ attemptCount: 1 }));
    handlerRegistry.dispatch.mockRejectedValue(new Error('network socket hang up'));

    await expect(
      service.processPersistentJobForWorker('org-1', 'job-1'),
    ).rejects.toBeInstanceOf(DrivingIntelligenceJobRetryableError);
  });
});
