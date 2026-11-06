import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import oneautoProviderConfig from '@config/oneauto-provider.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { OneAutoOeServiceScheduleFailedCallbackRecoveryService } from './oneauto-oe-service-schedule-failed-callback-recovery.service';

/** Side-effect: execution-verified registry Map populated at import time. */
import './catalog/oneauto-verified-contracts';

/**
 * Minimal Nest context for OE_SERVICE_SCHEDULE inbox recovery CLI only.
 * No workers, BullMQ, or Service History ingestion.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [oneautoProviderConfig],
    }),
    PrismaModule,
  ],
  providers: [OneAutoOeServiceScheduleFailedCallbackRecoveryService],
  exports: [OneAutoOeServiceScheduleFailedCallbackRecoveryService],
})
export class OneAutoOeServiceScheduleFailedCallbackRecoveryCliModule {}
