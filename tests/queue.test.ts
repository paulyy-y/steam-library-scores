import { describe, expect, it } from 'bun:test';
import { PrefetchQueue, type RunResult } from '../frontend/prefetch/queue';

const HOUR = 3600 * 1000;
const OPTS = { intervalMs: 3000, backoffMs: 300000, idleMs: 30000, doneTtlMs: 12 * HOUR, retryMs: HOUR };

function harness(results: Record<number, RunResult[]> = {}) {
  let clock = 0;
  const calls: number[] = [];
  const queue = new PrefetchQueue(
    async (appId) => {
      calls.push(appId);
      return results[appId]?.shift() ?? 'ok';
    },
    () => clock,
    OPTS,
  );
  const advance = (ms: number) => (clock += ms);
  return { queue, calls, advance };
}

describe('PrefetchQueue.step', () => {
  it('fetches in order and paces after each real fetch', async () => {
    const { queue, calls } = harness();
    queue.setOrder([1, 2]);
    expect(await queue.step()).toEqual({ appId: 1, result: 'ok', waitMs: 3000 });
    expect(await queue.step()).toEqual({ appId: 2, result: 'ok', waitMs: 3000 });
    expect(calls).toEqual([1, 2]);
  });

  it('moves straight on when the game was already fresh', async () => {
    const { queue } = harness({ 1: ['skipped'] });
    queue.setOrder([1, 2]);
    expect(await queue.step()).toEqual({ appId: 1, result: 'skipped', waitMs: 0 });
  });

  it('backs off on a rate limit and retries the same game', async () => {
    const { queue, calls } = harness({ 1: ['rate_limited', 'ok'] });
    queue.setOrder([1, 2]);
    expect(await queue.step()).toEqual({ appId: 1, result: 'rate_limited', waitMs: 300000 });
    expect(await queue.step()).toEqual({ appId: 1, result: 'ok', waitMs: 3000 });
    expect(calls).toEqual([1, 1]);
  });

  it('idles when there is nothing left to do', async () => {
    const { queue } = harness();
    queue.setOrder([1]);
    await queue.step();
    expect(await queue.step()).toEqual({ appId: null, result: null, waitMs: 30000 });
  });

  it('does not repeat finished games when the order is refreshed, until they go stale', async () => {
    const { queue, calls, advance } = harness();
    queue.setOrder([1]);
    await queue.step();
    queue.setOrder([1]);
    expect((await queue.step()).appId).toBeNull();
    advance(12 * HOUR + 1);
    queue.setOrder([1]);
    expect((await queue.step()).appId).toBe(1);
    expect(calls).toEqual([1, 1]);
  });

  it('retries a failed game only after the retry delay', async () => {
    const { queue, calls, advance } = harness({ 1: ['error', 'ok'] });
    queue.setOrder([1, 2]);
    expect(await queue.step()).toEqual({ appId: 1, result: 'error', waitMs: 3000 });
    queue.setOrder([1, 2]);
    expect((await queue.step()).appId).toBe(2);
    advance(HOUR + 1);
    queue.setOrder([1, 2]);
    expect((await queue.step()).appId).toBe(1);
    expect(calls).toEqual([1, 2, 1]);
  });

  it('follows a new order: newly visible games jump ahead', async () => {
    const { queue, calls } = harness();
    queue.setOrder([1, 2, 3]);
    await queue.step();
    queue.setOrder([3, 2]);
    await queue.step();
    expect(calls).toEqual([1, 3]);
  });

  it('treats a thrown fetch as an error', async () => {
    const queue = new PrefetchQueue(
      async () => {
        throw new Error('boom');
      },
      () => 0,
      OPTS,
    );
    queue.setOrder([1]);
    expect(await queue.step()).toEqual({ appId: 1, result: 'error', waitMs: 3000 });
  });
});
