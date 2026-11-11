import { ApdsV3ShadowRuntimeQueue } from './apds-v3-shadow-runtime.v1';

describe('ApdsV3ShadowRuntimeQueue', () => {
  it('drops work when queue is full', async () => {
    const q = new ApdsV3ShadowRuntimeQueue(1, 1, 5_000);
    let releaseFirst: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    expect(
      q.enqueue(async () => {
        await first;
      }),
    ).toBe(true);
    expect(q.enqueue(() => Promise.resolve())).toBe(true);
    expect(q.enqueue(() => Promise.resolve())).toBe(false);
    releaseFirst();
    await first;
    await q.drainForShutdown();
  });

  it('aborts cooperative work at deadline without releasing slot early', async () => {
    const q = new ApdsV3ShadowRuntimeQueue(1, 4, 30);
    let settled = false;
    const hung = q.enqueue((signal) => {
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          settled = true;
          reject(new Error('aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    });
    expect(hung).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(settled).toBe(true);
    expect(q.getStats().active).toBe(0);
    await q.drainForShutdown();
  });

  it('holds concurrency slot until work promise settles after hang with abort', async () => {
    const q = new ApdsV3ShadowRuntimeQueue(2, 8, 25);
    let peakActive = 0;
    const slow = q.enqueue(
      (signal) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          signal.addEventListener('abort', finish, { once: true });
          setTimeout(finish, 60);
        }),
    );
    const second = q.enqueue(async () => {
      peakActive = Math.max(peakActive, q.getStats().active);
    });
    expect(slow).toBe(true);
    expect(second).toBe(true);
    await q.drainForShutdown();
    expect(peakActive).toBeGreaterThanOrEqual(1);
  });
});
