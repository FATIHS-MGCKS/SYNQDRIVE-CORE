import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TireHealthService } from '@modules/vehicle-intelligence/tires/tire-health.service';
import { TIRE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/tires/tire-health-consumer.tokens';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { HighMobilityModule } from '@modules/high-mobility/high-mobility.module';
import { HmSignalUsageService } from '@modules/high-mobility/high-mobility-signal-usage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreTireReadModule } from './core-tire-read.module';
import { CoreTireReadV1Controller } from './core-tire-read.v1.controller';
import { CoreTireReadV1Service } from './core-tire-read.v1.service';

describe('CoreTireReadModule — Nest DI', () => {
  const vehicleIntelligenceTireStub: DynamicModule = {
    module: class VehicleIntelligenceTireStubModule {},
    providers: [
      {
        provide: TireHealthService,
        useValue: { getSummary: jest.fn().mockResolvedValue(null) },
      },
    ],
    exports: [TireHealthService],
  };

  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreTireReadModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(vehicleIntelligenceTireStub)
      .overrideModule(HighMobilityModule)
      .useModule({
        module: class HighMobilityStubModule {},
        providers: [
          {
            provide: HmSignalUsageService,
            useValue: { getTirePressureSignals: jest.fn().mockResolvedValue(null) },
          },
        ],
        exports: [HmSignalUsageService],
      })
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
    expect(moduleRef.get(CoreTireReadV1Controller)).toBeInstanceOf(CoreTireReadV1Controller);
    expect(moduleRef.get(CoreTireReadV1Service)).toBeInstanceOf(CoreTireReadV1Service);
  });

  it('injects TireHealthService via consumer export token', () => {
    const fromConsumerExport = moduleRef.get<{ getSummary: jest.Mock }>(TIRE_HEALTH_CONSUMER_EXPORT);
    const coreService = moduleRef.get(CoreTireReadV1Service);
    expect(fromConsumerExport).toBeDefined();
    expect((coreService as unknown as { tireHealth: unknown }).tireHealth).toBe(fromConsumerExport);
  });
});