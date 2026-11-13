import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DtcService } from './dtc.service';
import { DtcConsumerModule } from './dtc-consumer.module';
import { DTC_CONSUMER_EXPORT } from './dtc-consumer.tokens';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

@Module({
  imports: [DtcConsumerModule],
  providers: [
    {
      provide: 'DTC_CONSUMER_PROBE',
      useFactory: (svc: DtcService) => svc,
      inject: [DTC_CONSUMER_EXPORT],
    },
  ],
})
class DtcConsumerProbeModule {}

describe('DtcConsumerModule — export visibility (F1)', () => {
  it('re-exports DtcService through DTC_CONSUMER_EXPORT', async () => {
    const viStub: DynamicModule = {
      module: class VehicleIntelligenceDtcExportStubModule {},
      providers: [
        {
          provide: DtcService,
          useValue: { getSummary: jest.fn() },
        },
      ],
      exports: [DtcService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [DtcConsumerProbeModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
      .compile();

    const probe = moduleRef.get<{ getSummary: jest.Mock }>('DTC_CONSUMER_PROBE');
    expect(probe.getSummary).toBeDefined();
    await moduleRef.close();
  });
});
