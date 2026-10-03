// Row/app id lookup adapted from Yohlo/protondb-library-badges (MIT). See NOTICE.
import { findClassModule, getReactInstance } from '@steambrew/client';
import type { LibraryApp } from '../prefetch/candidates';
import type { LocalAppData } from '../scores/parse';

interface Overview {
  appid: number;
  display_name?: string;
  metacritic_score?: number;
  rt_last_time_played?: number;
  size_on_disk?: number | string;
}

const overviewOf = (appId: number): Overview | null => {
  try {
    return (window as any).appStore?.GetAppOverviewByAppID(appId) ?? null;
  } catch {
    return null;
  }
};

// Data Steam already holds locally for a game: no request needed.
export function localAppData(appId: number): LocalAppData {
  const overview = overviewOf(appId);
  return { metacriticScore: overview?.metacritic_score, name: overview?.display_name };
}

// Every app in the library, with what prefetch ordering needs.
export function libraryApps(): LibraryApp[] {
  const collection = (window as any).collectionStore?.allAppsCollection;
  const apps: Overview[] = collection?.allApps ?? collection?.visibleApps ?? [];
  return apps
    .filter((o) => typeof o?.appid === 'number')
    .map((o) => ({
      appId: o.appid,
      lastPlayed: Number(o.rt_last_time_played) || 0,
      installed: Number(o.size_on_disk) > 0,
    }));
}

// Finds one of Steam's CSS modules by its class keys; the hashed class names change between builds.
function classModuleFinder<K extends string>(...keys: K[]): () => Record<K, string> | null {
  let found: Record<K, string> | null = null;
  return () => {
    if (found) return found;
    const module = findClassModule((m: Record<string, unknown>) => keys.every((k) => typeof m[k] === 'string'));
    found = (module as Record<K, string> | undefined) ?? null;
    return found;
  };
}

const rowClasses = classModuleFinder('GameListEntryContainer', 'GameListEntryName');

type Props = Record<string, unknown>;
interface FiberLike {
  memoizedProps?: Props;
  return?: FiberLike | null;
}
const MAX_FIBER_DEPTH = 40;

function appIdFromProps(props: Props): number | null {
  for (const candidate of [props, props.item, props.appOverview]) {
    const appId = (candidate as { appid?: unknown } | undefined)?.appid;
    if (typeof appId === 'number') return appId;
  }
  return null;
}

function findAppIdFromElement(el: Element): number | null {
  let fiber: FiberLike | null | undefined;
  try {
    fiber = getReactInstance(el) as FiberLike | null;
  } catch {
    return null;
  }
  for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth++, fiber = fiber.return) {
    const appId = fiber.memoizedProps ? appIdFromProps(fiber.memoizedProps) : null;
    if (appId !== null) return appId;
  }
  return null;
}

// App ids of the rows currently rendered in the library list (it is virtualised).
export function visibleListAppIds(doc: Document): number[] {
  const c = rowClasses();
  if (!c) return [];
  const ids: number[] = [];
  doc.querySelectorAll('.' + c.GameListEntryContainer).forEach((row) => {
    const appId = findAppIdFromElement(row);
    if (appId !== null) ids.push(appId);
  });
  return ids;
}
