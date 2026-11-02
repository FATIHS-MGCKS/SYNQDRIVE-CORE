import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import oneautoProviderConfig from '@config/oneauto-provider.config';
import { AuthModule } from '@shared/auth/auth.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { OneAutoProviderController } from './oneauto-provider.controller';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderService } from './oneauto-provider.service';

@Module({
  imports: [
    ConfigModule.forFeature(oneautoProviderConfig),
    AuthModule,
    IamMfaModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ONEAUTO_PROVIDER }),
  ],
  controllers: [OneAutoProviderController],
  providers: [OneAutoHttpClient, OneAutoProviderService, OneAutoProviderExecutionService],
  exports: [OneAutoProviderService, OneAutoProviderExecutionService, OneAutoHttpClient],
})
export class OneAutoProviderModule {}
