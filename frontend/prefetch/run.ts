import { libraryApps, visibleListAppIds } from '../lib/steam';
import { fetchGame, fetchReviewsBatch, log } from '../services/backend';
import { prefetchOrder } from './candidates';
import { PrefetchQueue, type QueueOptions, type RunResult } from './queue';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const START_DELAY_MS = 10_000; // let Steam finish starting up first
const REVIEW_BATCH = 100; // ids per backend call (the backend sends 50 per request)
const REVIEW_BATCH_GAP_MS = 2_000;
const REVIEW_REFRESH_MS = 6 * HOUR; // re-run the batch pass; fresh games are skipped
const ORDER_REFRESH_MS = 30_000; // pick up newly visible rows and recently played games
const BACKOFF_MS = 5 * MINUTE;

const QUEUE_OPTIONS: QueueOptions = {
  intervalMs: 3_000,
  backoffMs: BACKOFF_MS,
  idleMs: ORDER_REFRESH_MS,
  doneTtlMs: 12 * HOUR,
  retryMs: HOUR,
};

const isSteamApp = (appId: number) => appId > 0 && appId < 0x80000000;

async function prefetchGame(appId: number): Promise<RunResult> {
  const result = await fetchGame(appId);
  if (!result) return 'error';
  if (result.rateLimited) return 'rate_limited';
  if (result.errors.length > 0) return 'error';
  return result.fetched > 0 ? 'ok' : 'skipped';
}

/**
 * Background prefetch so game pages open with their scores already cached:
 * review summaries for the whole library in batches, then SteamDB and recent
 * reviews one game at a time for visible, recently played and installed games.
 * Returns a stop function.
 */
export function startPrefetch(doc: Document): () => void {
  let stopped = false;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function reviewSummaries(): Promise<void> {
    while (!stopped) {
      const ids = libraryApps()
        .map((a) => a.appId)
        .filter(isSteamApp);
      let fetched = 0;
      for (let i = 0; i < ids.length && !stopped; ) {
        const result = await fetchReviewsBatch(ids.slice(i, i + REVIEW_BATCH));
        if (result?.rateLimited) {
          log('Steam rate-limited the review batch; pausing for 5 minutes');
          await sleep(BACKOFF_MS);
          continue;
        }
        i += REVIEW_BATCH;
        fetched += result?.fetched ?? 0;
        if (result && result.fetched > 0) await sleep(REVIEW_BATCH_GAP_MS);
      }
      log(`Review summaries refreshed for ${fetched} of ${ids.length} library games`);
      await sleep(REVIEW_REFRESH_MS);
    }
  }

  async function perGame(): Promise<void> {
    const queue = new PrefetchQueue(prefetchGame, Date.now, QUEUE_OPTIONS);
    let lastOrder = 0;
    let loggedOrder = false;
    let prefetched = 0;
    while (!stopped) {
      if (Date.now() - lastOrder >= ORDER_REFRESH_MS) {
        const order = prefetchOrder(libraryApps(), visibleListAppIds(doc), Math.floor(Date.now() / 1000));
        queue.setOrder(order);
        lastOrder = Date.now();
        if (!loggedOrder) {
          log(`Prefetch order: ${order.length} likely games`);
          loggedOrder = true;
        }
      }
      const step = await queue.step();
      if (step.result === 'ok' && ++prefetched % 25 === 0) log(`Prefetched ${prefetched} games`);
      if (step.result === 'rate_limited') log('Steam rate-limited prefetch; pausing for 5 minutes');
      if (step.waitMs > 0) await sleep(step.waitMs);
    }
  }

  sleep(START_DELAY_MS).then(() => {
    if (stopped) return;
    reviewSummaries().catch((e) => log('Review prefetch stopped:', String(e)));
    perGame().catch((e) => log('Game prefetch stopped:', String(e)));
  });

  return () => {
    stopped = true;
  };
}
