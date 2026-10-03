import { callable } from '@steambrew/client';
import type { RawSources, ScoreKey } from '../scores/types';

export type SourceKey = 'storebrowse' | 'appreviews' | 'recent_row';

export const SCORE_FOR_SOURCE: Record<SourceKey, ScoreKey> = {
  storebrowse: 'reviews',
  appreviews: 'steamdb',
  recent_row: 'recent',
};

export interface CachedState {
  raw: RawSources;
  missing: SourceKey[];
  stale: SourceKey[];
}

export interface FetchState extends CachedState {
  fetched: number;
  rateLimited: boolean;
  errors: string[];
}

const GetCachedRpc = callable<[{ app_id: number }], string>('GetCached');
const FetchGameRpc = callable<[{ app_id: number; force: boolean }], string>('FetchGame');
const FetchReviewsBatchRpc = callable<[{ app_ids_json: string }], string>('FetchReviewsBatch');
const LogRpc = callable<[{ message: string }], string>('Log');
export const ClearCache = callable<[], string>('ClearCache');

const PREFIX = '[Library Scores]';

// Console for DevTools, plus the plugin's log file for when DevTools isn't on.
export function log(...args: unknown[]): void {
  console.log(PREFIX, ...args);
  const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  LogRpc({ message }).catch(() => {});
}

// Lua encodes an empty list as {}, so anything that isn't an array is treated as empty.
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function parse(json: string | undefined): any | null {
  if (!json) return null;
  try {
    const result = JSON.parse(json);
    return result?.success ? result : null;
  } catch {
    return null;
  }
}

function toCachedState(result: any): CachedState {
  return {
    raw: (result.data && typeof result.data === 'object' ? result.data : {}) as RawSources,
    missing: list<SourceKey>(result.missing),
    stale: list<SourceKey>(result.stale),
  };
}

export async function getCached(appId: number): Promise<CachedState | null> {
  try {
    const result = parse(await GetCachedRpc({ app_id: appId }));
    return result ? toCachedState(result) : null;
  } catch (e) {
    log('GetCached failed for', appId, String(e));
    return null;
  }
}

export async function fetchGame(appId: number, force = false): Promise<FetchState | null> {
  try {
    const result = parse(await FetchGameRpc({ app_id: appId, force }));
    if (!result) return null;
    return {
      ...toCachedState(result),
      fetched: Number(result.fetched) || 0,
      rateLimited: result.rateLimited === true,
      errors: list<string>(result.errors),
    };
  } catch (e) {
    log('FetchGame failed for', appId, String(e));
    return null;
  }
}

export async function fetchReviewsBatch(appIds: number[]): Promise<{ fetched: number; rateLimited: boolean } | null> {
  try {
    const result = parse(await FetchReviewsBatchRpc({ app_ids_json: JSON.stringify(appIds) }));
    return result ? { fetched: Number(result.fetched) || 0, rateLimited: result.rateLimited === true } : null;
  } catch (e) {
    log('FetchReviewsBatch failed', String(e));
    return null;
  }
}
