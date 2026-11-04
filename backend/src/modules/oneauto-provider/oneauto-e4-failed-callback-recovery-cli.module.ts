import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import oneautoProviderConfig from '@config/oneauto-provider.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { OneAutoE4FailedCallbackRecoveryService } from './oneauto-e4-failed-callback-recovery.service';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';

/** Side-effect: execution-verified registry Map populated at import time. */
import './catalog/oneauto-verified-contracts';

/**
 * Minimal Nest context for the owner recovery CLI only.
 * Does not import ScheduleModule, WorkersModule, BullModule, or One Auto schedulers —
 * no background cron writers or queue workers are started for a one-shot inbox replay.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [oneautoProviderConfig],
    }),
    PrismaModule,
  ],
  providers: [
    OneAutoE4FailedCallbackRecoveryService,
    OneAutoOemVinLookupEuSuggestionMaterializationService,
  ],
  exports: [OneAutoE4FailedCallbackRecoveryService],
})
export class OneAutoE4FailedCallbackRecoveryCliModule {}
