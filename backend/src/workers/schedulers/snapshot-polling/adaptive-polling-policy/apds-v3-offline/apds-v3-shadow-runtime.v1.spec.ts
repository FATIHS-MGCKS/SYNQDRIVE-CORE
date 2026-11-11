import { ApdsV3ShadowRuntimeQueue } from './apds-v3-shadow-runtime.v1';

describe('ApdsV3ShadowRuntimeQueue', () => {
  it('drops work when queue is full', async () => {
    const q = new ApdsV3ShadowRuntimeQueue(1, 1, 5_000);
    let releaseFirst: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    expect(q.enqueue(() => first)).toBe(true);
    expect(q.enqueue(() => Promise.resolve())).toBe(true);
    expect(q.enqueue(() => Promise.resolve())).toBe(false);
    releaseFirst();
    await first;
    await q.drainForShutdown();
  });

  it('times out long-running shadow work without throwing to caller', async () => {
    const q = new ApdsV3ShadowRuntimeQueue(1, 4, 20);
    const hung = q.enqueue(
      () =>
        new Promise<void>(() => {
          /* never resolves */
        }),
    );
    expect(hung).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    await q.drainForShutdown();
  });
});
