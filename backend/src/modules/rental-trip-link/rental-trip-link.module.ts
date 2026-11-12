import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RentalTripLinkBackfillDryRunService } from './rental-trip-link-backfill.dry-run';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import { RentalTripLinkResolver } from './rental-trip-link.resolver';

@Module({
  imports: [PrismaModule],
  providers: [RentalTripLinkRepository, RentalTripLinkResolver, RentalTripLinkBackfillDryRunService],
  exports: [RentalTripLinkRepository, RentalTripLinkResolver, RentalTripLinkBackfillDryRunService],
})
export class RentalTripLinkModule {}
