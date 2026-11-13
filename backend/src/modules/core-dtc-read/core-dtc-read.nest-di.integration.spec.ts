import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { DTC_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/dtc/dtc-consumer.tokens';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreDtcReadModule } from './core-dtc-read.module';
import { CoreDtcReadV1Controller } from './core-dtc-read.v1.controller';
import { CoreDtcReadV1Service } from './core-dtc-read.v1.service';

describe('CoreDtcReadModule — runtime Nest DI integration (F1)', () => {
  const vehicleIntelligenceDtcStub: DynamicModule = {
    module: class VehicleIntelligenceDtcStubModule {},
    providers: [
      {
        provide: DtcService,
        useValue: { getSummary: jest.fn().mockResolvedValue(null) },
      },
    ],
    exports: [DtcService],
  };

  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreDtcReadModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(vehicleIntelligenceDtcStub)
      .overrideProvider(PrismaService)
      .useValue({
        vehicle: { findFirst: jest.fn(), findUnique: jest.fn() },
        organizationProduct: { findFirst: jest.fn() },
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('wires CoreDtcReadModule controller and service', () => {
    expect(moduleRef.get(CoreDtcReadV1Controller)).toBeInstanceOf(CoreDtcReadV1Controller);
    expect(moduleRef.get(CoreDtcReadV1Service)).toBeInstanceOf(CoreDtcReadV1Service);
  });

  it('injects DtcService via consumer export token (not root TestModule provider)', () => {
    const fromConsumerExport = moduleRef.get<{ getSummary: jest.Mock }>(DTC_CONSUMER_EXPORT);
    const coreService = moduleRef.get(CoreDtcReadV1Service);
    expect(fromConsumerExport).toBeDefined();
    expect((coreService as unknown as { dtc: unknown }).dtc).toBe(fromConsumerExport);
  });
});
