import { Test, type TestingModule } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOpsModule } from './dimo-source-link-ops.module';

describe('DimoSourceLinkOpsModule runtime bootstrap', () => {
  it('compiles minimal ops module without BullMQ workers or ScheduleModule providers', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DimoSourceLinkOpsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    await moduleRef.init();

    const container = moduleRef.get(ModulesContainer);
    const providerNames: string[] = [];
    for (const module of container.values()) {
      for (const wrapper of module.providers.values()) {
        const token = wrapper.token;
        const name =
          typeof token === 'function'
            ? token.name
            : typeof token === 'string'
              ? token
              : String(token);
        providerNames.push(name);
      }
    }

    expect(providerNames.join(',')).not.toMatch(/Bull|WorkerHost|Schedule|WorkersModule|AppModule/);

    await moduleRef.close();
  });
});
