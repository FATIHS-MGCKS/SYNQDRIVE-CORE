import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TireHealthService } from './tire-health.service';
import { TireHealthConsumerModule } from './tire-health-consumer.module';
import { TIRE_HEALTH_CONSUMER_EXPORT } from './tire-health-consumer.tokens';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

@Module({
  imports: [TireHealthConsumerModule],
  providers: [
    {
      provide: 'TIRE_HEALTH_CONSUMER_PROBE',
      useFactory: (svc: TireHealthService) => svc,
      inject: [TIRE_HEALTH_CONSUMER_EXPORT],
    },
  ],
})
class TireHealthConsumerProbeModule {}

describe('TireHealthConsumerModule — export visibility', () => {
  it('re-exports TireHealthService through TIRE_HEALTH_CONSUMER_EXPORT', async () => {
    const viStub: DynamicModule = {
      module: class VehicleIntelligenceTireExportStubModule {},
      providers: [
        {
          provide: TireHealthService,
          useValue: { getSummary: jest.fn() },
        },
      ],
      exports: [TireHealthService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [TireHealthConsumerProbeModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
      .compile();

    const probe = moduleRef.get<{ getSummary: jest.Mock }>('TIRE_HEALTH_CONSUMER_PROBE');
    expect(probe.getSummary).toBeDefined();
    await moduleRef.close();
  });
});