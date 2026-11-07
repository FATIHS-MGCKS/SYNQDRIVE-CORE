import { DimoSourceLinkOpsModule } from './dimo-source-link-ops.module';

describe('DimoSourceLinkOpsModule', () => {
  it('does not import AppModule, BullMQ root, ScheduleModule, or WorkersModule', () => {
    const metadata = Reflect.getMetadata('imports', DimoSourceLinkOpsModule) as unknown[];
    expect(metadata?.length).toBeGreaterThan(0);
    const importNames = metadata.map((entry: unknown) => {
      if (entry && typeof entry === 'function') return entry.name;
      if (entry && typeof entry === 'object' && 'module' in entry) {
        const mod = (entry as { module?: { name?: string } }).module;
        return mod?.name ?? String(entry);
      }
      return String(entry);
    });
    expect(importNames.join(',')).not.toMatch(/AppModule|BullModule|ScheduleModule|WorkersModule/);
  });
});
