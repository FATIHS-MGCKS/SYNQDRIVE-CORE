import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import redisConfig from '@config/redis.config';
import { RedisService } from '@shared/redis/redis.service';
import dimoProviderLimiterConfig from '@config/dimo-provider-limiter.config';
import { RedisModule } from '@shared/redis/redis.module';
import { DimoProviderGateway } from '@modules/dimo/provider/dimo-provider-gateway.service';
import { DimoProviderAdmissionService } from '@modules/dimo/provider/dimo-provider-admission.service';
import { DimoProviderLimiterService } from '@modules/dimo/provider/dimo-provider-limiter.service';
import { DimoProviderBudgetService } from '@modules/dimo/provider-budget/dimo-provider-budget.service';
import { DimoRequestExecutor } from '@modules/dimo/provider-budget/dimo-request-executor.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import dimoProviderBudgetConfig from '@modules/dimo/provider-budget/dimo-provider-budget.config';
import { FsdDimoAdapterFactoryService } from '../fsd-dimo-adapter-factory.service';
import { FsdDiscoveryOpsModule } from './fsd-discovery-ops.module';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { Registry } from 'prom-client';

/**
 * Minimum DIMO adapter slice for one-shot live CLI — no HTTP controllers, SnapshotWake, or VehicleIntelligence graph.
 */
@Module({
  imports: [
    FsdDiscoveryOpsModule,
    RedisModule,
    ConfigModule.forFeature(redisConfig),
    ConfigModule.forFeature(dimoConfig),
    ConfigModule.forFeature(dimoProviderLimiterConfig),
    ConfigModule.forFeature(dimoProviderBudgetConfig),
  ],
  providers: [
    {
      provide: TripMetricsService,
      useValue: {
        onModuleInit: (): void => undefined,
        registry: new Registry(),
      },
    },
    DimoProviderAdmissionService,
    DimoProviderLimiterService,
    DimoProviderBudgetService,
    DimoRequestExecutor,
    DimoProviderGateway,
    {
      provide: DimoAuthService,
      useFactory: (conf: ConfigType<typeof dimoConfig>, redis: RedisService, executor: DimoRequestExecutor) => {
        const svc = new DimoAuthService(conf, redis, executor);
        svc.onModuleInit = () => undefined;
        return svc;
      },
      inject: [dimoConfig.KEY, RedisService, DimoRequestExecutor],
    },
    DimoTelemetryService,
    FsdDimoAdapterFactoryService,
  ],
  exports: [FsdDimoAdapterFactoryService, FsdDiscoveryOpsModule],
})
export class Fsd3OneShotDimoLiveSliceModule {}
