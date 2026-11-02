import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import { VsiProviderSourceObservationWriterService } from './vsi-provider-source-observation.writer.service';
import { VsiStrictSourceAdvanceService } from './vsi-strict-source-advance.service';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiP3aPerLinkCatalogRepository } from './vsi-p3a-per-link-catalog.repository';
import { VsiP3aPerLinkCatalogWriterService } from './vsi-p3a-per-link-catalog-writer.service';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import { VsiProfileLifecycleOutboxWorker } from './vsi-profile-lifecycle.worker';
import { VsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationRepository,
    VsiProviderSourceObservationWriterService,
    VsiStrictSourceAdvanceService,
    VsiDeclaredCatalogResolver,
    VsiP3aPerLinkCatalogRepository,
    VsiP3aPerLinkCatalogWriterService,
    VsiProfileCadenceEvidenceLoader,
    VsiSignalProfileMaterializationService,
    VsiProfileRevisionHistoryRepository,
    VsiProfileLifecycleOutboxRepository,
    VsiProfileLifecycleEnqueueService,
    VsiProfileLifecycleOutboxProcessor,
    VsiProfileLifecycleOutboxWorker,
  ],
  exports: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationWriterService,
    VsiSignalProfileMaterializationService,
    VsiDeclaredCatalogResolver,
    VsiP3aPerLinkCatalogWriterService,
    VsiProfileLifecycleEnqueueService,
    VsiProfileLifecycleOutboxProcessor,
    VsiProfileLifecycleOutboxWorker,
    VsiProfileRevisionHistoryRepository,
  ],
})
export class VsiReadonlySignalComposerModule {}
