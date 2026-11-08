import { Test, type TestingModule } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { FsdDiscoveryOpsModule } from '../fsd-discovery-ops.module';

describe('FsdDiscoveryOpsModule runtime bootstrap', () => {
  it('compiles minimal ops module without schedulers workers or HTTP', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [FsdDiscoveryOpsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        vehicleDataSourceLink: { findFirst: jest.fn() },
        fsdDiscoveryRun: { findFirst: jest.fn() },
      })
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
    expect(names.join(',')).not.toMatch(/Bull|WorkerHost|Schedule|WorkersModule|AppModule/);

    await moduleRef.close();
  });
});
