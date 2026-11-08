import { Test, type TestingModule } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { DimoRequestExecutor } from '@modules/dimo/provider-budget/dimo-request-executor.service';
import { Fsd3OneShotLiveBootstrapModule } from '../fsd3-one-shot-live-bootstrap.module';
import { FsdDimoAdapterFactoryService } from '../../fsd-dimo-adapter-factory.service';

describe('Fsd3OneShotLiveBootstrapModule integration boot', () => {
  it('boots slim live slice without workers schedulers HTTP or provider dispatch on init', async () => {
    const executeSpy = jest.fn().mockRejectedValue(new Error('PROVIDER_DISPATCH_FORBIDDEN_IN_BOOT_TEST'));
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [Fsd3OneShotLiveBootstrapModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        getClient: () => ({
          ping: jest.fn().mockResolvedValue('PONG'),
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
          eval: jest.fn(),
        }),
      })
      .overrideProvider(DimoRequestExecutor)
      .useValue({ execute: executeSpy })
      .compile();

    await moduleRef.init();

    const container = moduleRef.get(ModulesContainer);
    const names: string[] = [];
    for (const module of container.values()) {
      for (const wrapper of module.providers.values()) {
        const token = wrapper.token;
        names.push(typeof token === 'function' ? token.name : String(token));
      }
    }
    expect(names.join(',')).toMatch(/DimoProviderBudgetService/);
    expect(names.join(',')).toMatch(/DimoAuthService/);
    expect(names.join(',')).toMatch(/DimoTelemetryService/);
    expect(names.join(',')).not.toMatch(/Bull|WorkerHost|Schedule|WorkersModule|AppModule|Controller/);
    expect(executeSpy).not.toHaveBeenCalled();

    const factory = moduleRef.get(FsdDimoAdapterFactoryService);
    expect(factory.createAdapter().createFsd3Port().providerKind).toBe('live');

    await moduleRef.close();
  });
});
