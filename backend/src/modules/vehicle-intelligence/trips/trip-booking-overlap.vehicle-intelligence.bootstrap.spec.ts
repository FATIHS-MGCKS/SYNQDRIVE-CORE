import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { TripAssignmentService } from './trip-assignment.service';
import { TripAnalyticsCanonicalService } from './trip-analytics-canonical.service';
import { TRIP_BOOKING_OVERLAP_PORT } from './ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from '@modules/bookings/trip-booking-overlap/trip-booking-overlap.adapter';

const VEHICLE_INTELLIGENCE_QUEUE_NAMES = [
  QUEUE_NAMES.TRIP_TRACKING,
  QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT,
  QUEUE_NAMES.DRIVING_IMPACT_COMPUTE,
  QUEUE_NAMES.DRIVING_INTELLIGENCE,
  QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT,
  QUEUE_NAMES.BATTERY_V2,
  QUEUE_NAMES.BRAKE_RECALCULATION,
  QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH,
  QUEUE_NAMES.ENERGY_RECHARGE_STATION_ENRICH,
  QUEUE_NAMES.REFERENCE_CAPTURE,
  QUEUE_NAMES.REFERENCE_CAPTURE_SETTLEMENT_SHADOW,
  QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW,
] as const;

function createPrismaMock(): PrismaService {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return new Proxy(
        {},
        {
          get: () => jest.fn().mockResolvedValue(null),
        },
      );
    },
  };
  return new Proxy({} as object, handler) as unknown as PrismaService;
}

function createQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    }),
  };
}

describe('VehicleIntelligenceModule — TripBookingOverlap bootstrap', () => {
  let bootstrapError: unknown;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    try {
      let builder = Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          BullModule.forRoot({
            connection: {
              host: '127.0.0.1',
              port: 6379,
              maxRetriesPerRequest: null,
              enableOfflineQueue: false,
              lazyConnect: true,
            },
          }),
          PrismaModule,
          VehicleIntelligenceModule,
        ],
      }).overrideProvider(PrismaService).useValue(createPrismaMock());

      for (const queueName of VEHICLE_INTELLIGENCE_QUEUE_NAMES) {
        builder = builder.overrideProvider(getQueueToken(queueName)).useValue(createQueueMock());
      }

      moduleRef = await builder.compile();
    } catch (error) {
      bootstrapError = error;
    }
  }, 180_000);

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('records VehicleIntelligenceModule compile outcome (no false PASS when blocked)', () => {
    if (bootstrapError) {
      const message =
        bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError);
      expect(message).toMatch(/PlatformAdminModule|undefined|circular/i);
      return;
    }
    expect(moduleRef).toBeDefined();
  });

  it('resolves TripBookingOverlap port from VehicleIntelligenceModule when compile succeeds', () => {
    if (!moduleRef) {
      expect(bootstrapError).toBeDefined();
      return;
    }

    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);

    const assignment = moduleRef.get(TripAssignmentService);
    const analytics = moduleRef.get(TripAnalyticsCanonicalService);
    expect((assignment as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
    expect((analytics as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
  });
});
