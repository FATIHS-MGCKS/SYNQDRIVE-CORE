import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import {
  OneAutoProviderExecutionService,
  type OneAutoProviderJobPayload,
} from '@modules/oneauto-provider/oneauto-provider-execution.service';

@Processor(QUEUE_NAMES.ONEAUTO_PROVIDER, { concurrency: 3 })
export class OneAutoProviderProcessor extends WorkerHost {
  constructor(private readonly execution: OneAutoProviderExecutionService) {
    super();
  }

  async process(job: Job<OneAutoProviderJobPayload>): Promise<void> {
    await this.execution.processJob(job.data.jobId, job.data.phase ?? 'initial');
  }
}
