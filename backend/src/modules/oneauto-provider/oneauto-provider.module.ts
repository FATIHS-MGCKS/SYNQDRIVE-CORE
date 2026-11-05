import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import oneautoProviderConfig from '@config/oneauto-provider.config';
import { AuthModule } from '@shared/auth/auth.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { OneAutoProviderController } from './oneauto-provider.controller';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderService } from './oneauto-provider.service';
import { OneAutoOemVinLookupEuSuggestionController } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion.controller';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';
import { OneAutoOemVinLookupEuSuggestionReadService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-read.service';
import { OneAutoOemVinLookupEuSuggestionCleanupService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-cleanup.service';
import { OneAutoOemVinLookupEuSuggestionRecoveryService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-recovery.service';
import { OneAutoOeServiceHistoryEuIngestionService } from './service-history/oneauto-oe-service-history-eu-ingestion.service';
import { OneAutoOeServiceHistoryEuIngestionRecoveryService } from './service-history/oneauto-oe-service-history-eu-ingestion-recovery.service';
import { OneAutoOemVinLookupEuSuggestionCleanupScheduler } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-cleanup.scheduler';
import { OneAutoProviderJobExpiryScheduler } from './oneauto-provider-job-expiry.scheduler';
import { OneAutoProviderCallbackController } from './oneauto-provider-callback.controller';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { OneAutoE4FailedCallbackRecoveryService } from './oneauto-e4-failed-callback-recovery.service';

@Module({
  imports: [
    ConfigModule.forFeature(oneautoProviderConfig),
    AuthModule,
    IamMfaModule,
    SchedulerLeaderElectionModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ONEAUTO_PROVIDER }),
  ],
  controllers: [
    OneAutoProviderController,
    OneAutoOemVinLookupEuSuggestionController,
    OneAutoProviderCallbackController,
  ],
  providers: [
    OneAutoHttpClient,
    OneAutoProviderService,
    OneAutoProviderExecutionService,
    OneAutoProviderCallbackService,
    OneAutoE4FailedCallbackRecoveryService,
    OneAutoOemVinLookupEuSuggestionMaterializationService,
    OneAutoOemVinLookupEuSuggestionReadService,
    OneAutoOemVinLookupEuSuggestionCleanupService,
    OneAutoOemVinLookupEuSuggestionRecoveryService,
    OneAutoOeServiceHistoryEuIngestionService,
    OneAutoOeServiceHistoryEuIngestionRecoveryService,
    OneAutoOemVinLookupEuSuggestionCleanupScheduler,
    OneAutoProviderJobExpiryScheduler,
  ],
  exports: [
    OneAutoProviderService,
    OneAutoProviderExecutionService,
    OneAutoHttpClient,
    OneAutoOemVinLookupEuSuggestionMaterializationService,
    OneAutoOemVinLookupEuSuggestionReadService,
    OneAutoOemVinLookupEuSuggestionCleanupService,
    OneAutoOemVinLookupEuSuggestionRecoveryService,
    OneAutoOeServiceHistoryEuIngestionService,
    OneAutoOeServiceHistoryEuIngestionRecoveryService,
    OneAutoE4FailedCallbackRecoveryService,
  ],
})
export class OneAutoProviderModule {}
