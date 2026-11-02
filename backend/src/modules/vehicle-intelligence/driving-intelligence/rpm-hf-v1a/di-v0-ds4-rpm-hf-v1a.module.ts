import { Module } from '@nestjs/common';
import { ClickHouseModule } from '@modules/clickhouse/clickhouse.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { VsiCapabilityResolverRepository } from '../../vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { Ds4RpmHfV1aTripInputService } from './ds4-rpm-hf-v1a-trip-input.service';

/**
 * DS4 RPM High Frequency V1A — data integration + admission only.
 * No scheduler, outbox, or production activation.
 */
@Module({
  imports: [PrismaModule, ClickHouseModule],
  providers: [Ds4RpmHfV1aTripInputService, VsiCapabilityResolverRepository],
  exports: [Ds4RpmHfV1aTripInputService],
})
export class DiV0Ds4RpmHfV1aModule {}
