import { MODULE_METADATA } from '@nestjs/common/constants';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkersModule } from '@workers/workers.module';
import { OneAutoE4FailedCallbackRecoveryCliModule } from './oneauto-e4-failed-callback-recovery-cli.module';
import { OneAutoProviderJobExpiryScheduler } from './oneauto-provider-job-expiry.scheduler';

describe('OneAutoE4FailedCallbackRecoveryCliModule bootstrap isolation', () => {
  it('does not import WorkersModule, ScheduleModule, or BullModule', () => {
    const imports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, OneAutoE4FailedCallbackRecoveryCliModule) ?? [];
    const importTokens = imports.map((entry) =>
      typeof entry === 'function' ? entry.name : String(entry),
    );
    expect(importTokens.some((name) => name.includes('WorkersModule'))).toBe(false);
    expect(imports).not.toContain(WorkersModule);
    expect(imports).not.toContain(ScheduleModule);
    expect(imports.some((entry) => entry === BullModule || (entry as { module?: unknown })?.module === BullModule)).toBe(
      false,
    );
  });

  it('does not register One Auto cron schedulers as providers', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OneAutoE4FailedCallbackRecoveryCliModule) ?? [];
    expect(providers).not.toContain(OneAutoProviderJobExpiryScheduler);
  });
});
