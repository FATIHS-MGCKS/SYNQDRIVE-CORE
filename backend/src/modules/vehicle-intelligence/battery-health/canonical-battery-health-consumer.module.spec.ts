import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import { CanonicalBatteryHealthConsumerModule } from './canonical-battery-health-consumer.module';
import { CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT } from './canonical-battery-health-consumer.tokens';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

@Module({
  imports: [CanonicalBatteryHealthConsumerModule],
  providers: [
    {
      provide: 'CANONICAL_BATTERY_CONSUMER_PROBE',
      useFactory: (svc: CanonicalBatteryHealthService) => svc,
      inject: [CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT],
    },
  ],
})
class CanonicalBatteryHealthConsumerProbeModule {}

describe('CanonicalBatteryHealthConsumerModule — export visibility (F1)', () => {
  it('re-exports VehicleIntelligenceModule exports to inject CanonicalBatteryHealthService', async () => {
    const viStub: DynamicModule = {
      module: class VehicleIntelligenceExportStubModule {},
      providers: [
        {
          provide: CanonicalBatteryHealthService,
          useValue: { getSummary: jest.fn() },
        },
      ],
      exports: [CanonicalBatteryHealthService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [CanonicalBatteryHealthConsumerProbeModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
      .compile();

    const probe = moduleRef.get<{ getSummary: jest.Mock }>('CANONICAL_BATTERY_CONSUMER_PROBE');
    expect(probe.getSummary).toBeDefined();
    await moduleRef.close();
  });
});
