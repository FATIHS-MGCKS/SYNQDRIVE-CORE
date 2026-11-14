import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BrakeHealthService } from './brake-health.service';
import { BrakeHealthConsumerModule } from './brake-health-consumer.module';
import { BRAKE_HEALTH_CONSUMER_EXPORT } from './brake-health-consumer.tokens';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

@Module({
  imports: [BrakeHealthConsumerModule],
  providers: [
    {
      provide: 'BRAKE_HEALTH_CONSUMER_PROBE',
      useFactory: (svc: BrakeHealthService) => svc,
      inject: [BRAKE_HEALTH_CONSUMER_EXPORT],
    },
  ],
})
class BrakeHealthConsumerProbeModule {}

describe('BrakeHealthConsumerModule — export visibility', () => {
  it('re-exports BrakeHealthService through BRAKE_HEALTH_CONSUMER_EXPORT', async () => {
    const viStub: DynamicModule = {
      module: class VehicleIntelligenceBrakeExportStubModule {},
      providers: [
        {
          provide: BrakeHealthService,
          useValue: { getSummary: jest.fn() },
        },
      ],
      exports: [BrakeHealthService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [BrakeHealthConsumerProbeModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
      .compile();

    const probe = moduleRef.get<{ getSummary: jest.Mock }>('BRAKE_HEALTH_CONSUMER_PROBE');
    expect(probe.getSummary).toBeDefined();
    await moduleRef.close();
  });
});