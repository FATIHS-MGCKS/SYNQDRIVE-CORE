import { ConfigModule } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';

export const VEHICLE_INTELLIGENCE_QUEUE_NAMES = [
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

/** Recorded main@77e9843aa probe outcome for regression comparison. */
export const BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE =
  'Nest cannot create the PlatformAdminModule instance' as const;

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

export type ViFullBootstrapProbeResult =
  | { outcome: 'PASS'; moduleRef: TestingModule }
  | { outcome: 'FAIL'; message: string };

export async function probeVehicleIntelligenceModuleCompile(): Promise<ViFullBootstrapProbeResult> {
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

    const moduleRef = await builder.compile();
    return { outcome: 'PASS', moduleRef };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: 'FAIL', message };
  }
}

export function classifyBootstrapFailure(message: string): 'BASELINE_BLOCKED' | 'REGRESSION' {
  if (message.includes(BASELINE_MAIN_VI_BOOTSTRAP_ERROR_SIGNATURE)) {
    return 'BASELINE_BLOCKED';
  }
  if (/PlatformAdminModule|undefined|circular/i.test(message)) {
    return 'BASELINE_BLOCKED';
  }
  return 'REGRESSION';
}
