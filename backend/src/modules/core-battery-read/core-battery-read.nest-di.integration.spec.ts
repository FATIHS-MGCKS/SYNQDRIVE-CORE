import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health-consumer.tokens';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreBatteryReadModule } from './core-battery-read.module';
import { CoreBatteryReadV1Controller } from './core-battery-read.v1.controller';
import { CoreBatteryReadV1Service } from './core-battery-read.v1.service';

/**
 * Production graph: CoreBatteryReadModule → CanonicalBatteryHealthConsumerModule
 * → forwardRef(VehicleIntelligenceModule) [exports re-forwarded].
 *
 * Full VehicleIntelligenceModule does not compile under Jest (PlatformAdminModule
 * imports[5] undefined; VI ↔ RentalHealth forwardRef cycle). This integration test
 * keeps the **actual CoreBatteryReadModule** import chain and replaces only the
 * VI module boundary with a minimal export stub — CanonicalBatteryHealthService
 * is resolved via module exports, not registered on the root TestModule.
 */
describe('CoreBatteryReadModule — runtime Nest DI integration (F1)', () => {
  const vehicleIntelligenceBatteryStub: DynamicModule = {
    module: class VehicleIntelligenceBatteryStubModule {},
    providers: [
      {
        provide: CanonicalBatteryHealthService,
        useValue: { getSummary: jest.fn().mockResolvedValue(null) },
      },
    ],
    exports: [CanonicalBatteryHealthService],
  };

  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CoreBatteryReadModule],
    })
      .overrideModule(VehicleIntelligenceModule)
      .useModule(vehicleIntelligenceBatteryStub)
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

  it('wires CoreBatteryReadModule controller and service', () => {
    expect(moduleRef.get(CoreBatteryReadV1Controller)).toBeInstanceOf(CoreBatteryReadV1Controller);
    expect(moduleRef.get(CoreBatteryReadV1Service)).toBeInstanceOf(CoreBatteryReadV1Service);
  });

  it('injects CanonicalBatteryHealthService via consumer export token (not root TestModule provider)', () => {
    const fromConsumerExport = moduleRef.get<CanonicalBatteryHealthService>(
      CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT,
    );
    const coreService = moduleRef.get(CoreBatteryReadV1Service);
    expect(fromConsumerExport).toBeDefined();
    expect((coreService as unknown as { canonicalBatteryHealth: unknown }).canonicalBatteryHealth).toBe(
      fromConsumerExport,
    );
  });
});
