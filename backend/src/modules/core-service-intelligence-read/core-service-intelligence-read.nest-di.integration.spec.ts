import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { SERVICE_COMPLIANCE_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/service-compliance/service-compliance-consumer.tokens';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreServiceIntelligenceReadModule } from './core-service-intelligence-read.module';
import { CoreServiceIntelligenceReadV1Controller } from './core-service-intelligence-read.v1.controller';
import { CoreServiceIntelligenceReadV1Service } from './core-service-intelligence-read.v1.service';

describe('CoreServiceIntelligenceReadModule — Nest DI', () => {
  const viStub: DynamicModule = {
    module: class VehicleIntelligenceServiceComplianceStubModule {},
    providers: [
      {
        provide: ServiceComplianceService,
        useValue: { evaluateNextServiceDetailed: jest.fn().mockResolvedValue({ nextService: {}, forecast: null }) },
      },
    ],
    exports: [ServiceComplianceService],
  };

  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreServiceIntelligenceReadModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(viStub)
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

  it('wires controller and service', () => {
    expect(moduleRef.get(CoreServiceIntelligenceReadV1Controller)).toBeInstanceOf(
      CoreServiceIntelligenceReadV1Controller,
    );
    expect(moduleRef.get(CoreServiceIntelligenceReadV1Service)).toBeInstanceOf(CoreServiceIntelligenceReadV1Service);
  });

  it('injects ServiceComplianceService via consumer export', () => {
    const fromExport = moduleRef.get<{ evaluateNextServiceDetailed: jest.Mock }>(
      SERVICE_COMPLIANCE_CONSUMER_EXPORT,
    );
    const coreService = moduleRef.get(CoreServiceIntelligenceReadV1Service);
    expect(fromExport).toBeDefined();
    expect((coreService as unknown as { serviceCompliance: unknown }).serviceCompliance).toBe(fromExport);
  });
});
