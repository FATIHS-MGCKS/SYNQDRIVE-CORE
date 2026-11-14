import { DynamicModule } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BrakeHealthService } from '@modules/vehicle-intelligence/brakes/brake-health.service';
import { BRAKE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/brakes/brake-health-consumer.tokens';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreBrakeReadModule } from './core-brake-read.module';
import { CoreBrakeReadV1Controller } from './core-brake-read.v1.controller';
import { CoreBrakeReadV1Service } from './core-brake-read.v1.service';

describe('CoreBrakeReadModule — Nest DI', () => {
  const vehicleIntelligenceBrakeStub: DynamicModule = {
    module: class VehicleIntelligenceBrakeStubModule {},
    providers: [
      {
        provide: BrakeHealthService,
        useValue: { getSummary: jest.fn().mockResolvedValue(null) },
      },
    ],
    exports: [BrakeHealthService],
  };

  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreBrakeReadModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(vehicleIntelligenceBrakeStub)
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
    expect(moduleRef.get(CoreBrakeReadV1Controller)).toBeInstanceOf(CoreBrakeReadV1Controller);
    expect(moduleRef.get(CoreBrakeReadV1Service)).toBeInstanceOf(CoreBrakeReadV1Service);
  });

  it('injects BrakeHealthService via consumer export token', () => {
    const fromConsumerExport = moduleRef.get<{ getSummary: jest.Mock }>(BRAKE_HEALTH_CONSUMER_EXPORT);
    const coreService = moduleRef.get(CoreBrakeReadV1Service);
    expect(fromConsumerExport).toBeDefined();
    expect((coreService as unknown as { brakeHealth: unknown }).brakeHealth).toBe(fromConsumerExport);
  });
});