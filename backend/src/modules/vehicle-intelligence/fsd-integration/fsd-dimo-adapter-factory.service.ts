import { Injectable } from '@nestjs/common';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { FsdDiscoveryPersistenceRepository } from '@fsd/persistence/fsd-discovery-persistence.repository';
import {
  createFsdDimoLiveDiscoveryAdapterV1,
  FsdDimoLiveDiscoveryAdapterV1,
} from '@fsd/orchestration/fsd-dimo-live-discovery.adapter.v1';

@Injectable()
export class FsdDimoAdapterFactoryService {
  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
  ) {}

  createAdapter(): FsdDimoLiveDiscoveryAdapterV1 {
    return createFsdDimoLiveDiscoveryAdapterV1({
      dimoAuth: this.dimoAuth,
      dimoTelemetry: this.dimoTelemetry,
      persistence: this.persistence,
    });
  }
}
