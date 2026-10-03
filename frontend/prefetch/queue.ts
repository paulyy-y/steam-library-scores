export type RunResult = 'ok' | 'skipped' | 'rate_limited' | 'error';

export interface QueueOptions {
  intervalMs: number; // pause after a game that needed requests
  backoffMs: number; // pause after Steam rate-limits us
  idleMs: number; // pause when there is nothing to do
  doneTtlMs: number; // don't revisit a finished game for this long
  retryMs: number; // don't retry a failed game for this long
}

export interface StepOutcome {
  appId: number | null;
  result: RunResult | null;
  waitMs: number;
}

/**
 * Background prefetch, one game at a time. The caller loops: `await step()`, then
 * waits `waitMs`. setOrder() can be called at any time with a fresh priority order.
 */
export class PrefetchQueue {
  private order: number[] = [];
  private doneAt = new Map<number, number>();
  private failedAt = new Map<number, number>();

  constructor(
    private readonly run: (appId: number) => Promise<RunResult>,
    private readonly now: () => number,
    private readonly opts: QueueOptions,
  ) {}

  setOrder(appIds: number[]): void {
    this.order = [...appIds];
  }

  private next(): number | null {
    const now = this.now();
    for (const appId of this.order) {
      const done = this.doneAt.get(appId);
      if (done !== undefined && now - done < this.opts.doneTtlMs) continue;
      const failed = this.failedAt.get(appId);
      if (failed !== undefined && now - failed < this.opts.retryMs) continue;
      return appId;
    }
    return null;
  }

  async step(): Promise<StepOutcome> {
    const appId = this.next();
    if (appId === null) return { appId: null, result: null, waitMs: this.opts.idleMs };

    let result: RunResult;
    try {
      result = await this.run(appId);
    } catch {
      result = 'error';
    }

    switch (result) {
      case 'rate_limited':
        return { appId, result, waitMs: this.opts.backoffMs };
      case 'error':
        this.failedAt.set(appId, this.now());
        return { appId, result, waitMs: this.opts.intervalMs };
      case 'skipped':
        this.doneAt.set(appId, this.now());
        return { appId, result, waitMs: 0 };
      case 'ok':
        this.doneAt.set(appId, this.now());
        this.failedAt.delete(appId);
        return { appId, result, waitMs: this.opts.intervalMs };
    }
  }
}
