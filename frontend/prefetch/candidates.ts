export interface LibraryApp {
  appId: number;
  lastPlayed: number; // unix seconds, 0 = never
  installed: boolean;
}

const DAY = 86400;
// Non-Steam shortcuts get app ids with the high bit set; Steam has no scores for them.
const isSteamApp = (appId: number) => Number.isInteger(appId) && appId > 0 && appId < 0x80000000;
const byLastPlayedDesc = (a: LibraryApp, b: LibraryApp) => b.lastPlayed - a.lastPlayed;

// Which games to prefetch, most likely to be opened first: rows visible in the
// library list, then games played in the last `recentDays`, then installed games.
export function prefetchOrder(apps: LibraryApp[], visible: number[], now: number, recentDays = 90): number[] {
  const order = new Set<number>();
  const add = (appId: number) => {
    if (isSteamApp(appId)) order.add(appId);
  };

  visible.forEach(add);
  const recentSince = now - recentDays * DAY;
  apps
    .filter((a) => a.lastPlayed > 0 && a.lastPlayed >= recentSince)
    .sort(byLastPlayedDesc)
    .forEach((a) => add(a.appId));
  apps
    .filter((a) => a.installed)
    .sort(byLastPlayedDesc)
    .forEach((a) => add(a.appId));

  return [...order];
}
