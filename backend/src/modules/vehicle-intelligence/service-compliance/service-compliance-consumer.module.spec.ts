import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ServiceComplianceService } from './service-compliance.service';
import { ServiceComplianceConsumerModule } from './service-compliance-consumer.module';
import { SERVICE_COMPLIANCE_CONSUMER_EXPORT } from './service-compliance-consumer.tokens';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

@Module({
  imports: [ServiceComplianceConsumerModule],
  providers: [
    {
      provide: 'SERVICE_COMPLIANCE_PROBE',
      useFactory: (svc: ServiceComplianceService) => svc,
      inject: [SERVICE_COMPLIANCE_CONSUMER_EXPORT],
    },
  ],
})
class ServiceComplianceConsumerProbeModule {}

describe('ServiceComplianceConsumerModule — export visibility', () => {
  it('re-exports ServiceComplianceService through SERVICE_COMPLIANCE_CONSUMER_EXPORT', async () => {
    const viStub: DynamicModule = {
      module: class VehicleIntelligenceServiceComplianceStubModule {},
      providers: [
        {
          provide: ServiceComplianceService,
          useValue: { evaluateNextServiceDetailed: jest.fn() },
        },
      ],
      exports: [ServiceComplianceService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ServiceComplianceConsumerProbeModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
      .compile();

    const probe = moduleRef.get<{ evaluateNextServiceDetailed: jest.Mock }>('SERVICE_COMPLIANCE_PROBE');
    expect(probe.evaluateNextServiceDetailed).toBeDefined();
    await moduleRef.close();
  });
});
