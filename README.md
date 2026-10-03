# Library Scores

A [Millennium](https://steambrew.app/) plugin that shows review scores on Steam library game pages,
in a strip at the bottom-left of the game's hero image (Desktop and Big Picture):

| Cell | Source |
| --- | --- |
| **Reviews** | Steam's all-language review summary (`IStoreBrowseService/GetItems`, `summary_filtered`), fetched in batches |
| **Recent** | The store page's "Recent Reviews" row (last 30 days, off-topic periods excluded). Steam has no API for it. |
| **SteamDB** | SteamDB's formula over all reviews, all purchase types, off-topic included (`appreviews`) |
| **Metacritic** | `metacritic_score` from Steam's local app overview (no request) |

Scores are coloured like Steam's review colours. Hover for details, click to open the source:
review pages open in Steam, SteamDB and a Metacritic search in your browser. Each score can be
turned off in Steam menu > Millennium Library Manager > Library Scores. Non-Steam shortcuts are
skipped.

## How it works

- Prefetch, so pages open with scores already there (`frontend/prefetch`), starting 10 s after
  Steam starts:
  - Review summaries for the whole library, 50 games per request, re-checked every 6 hours.
  - SteamDB and recent reviews one game every 3 s, in this order: rows visible in the library
    list, games played in the last 90 days, installed games. The order is refreshed every 30 s.
  - On HTTP 429 from Steam, prefetch pauses for 5 minutes.
- Opening a game shows whatever is cached at once ("…" for parts still loading) and fetches only
  missing or stale parts.
- `backend/` (Lua) fetches the sources and caches raw bodies per game and per source in
  `cache.json` in the plugin's own folder: stale after 12 hours (shown, then refreshed), dropped
  after 30 days. Lua handles one call at a time, so opening a page waits for at most one prefetch
  request.
- `frontend/scores/` (TypeScript) parses the raw bodies and builds the cells. All parsing lives
  here so it can be unit tested.
- `frontend/injection/` detects library game pages and injects the strip.

Plugin data files go in the plugin's folder (`backend/paths.lua`), not
`millennium.get_install_path()`: that is Millennium's own folder, shared by every plugin.

## Development

```bash
npm install
npm test              # bun tests for frontend/scores and frontend/prefetch
npm run typecheck
npm run build         # millennium-ttc -> .millennium/Dist
npm run deploy:dry    # show what deploy would copy
npm run deploy        # copy into <Steam>/millennium/plugins/steam-library-scores
```

`deploy` uses `STEAM_PATH` or `C:\Program Files (x86)\Steam`, and keeps the installed plugin's
`cache.json` and `settings.json`. Frontend changes show after F5 in Steam; backend changes need a
Steam restart. Enable the plugin once in Millennium's plugin list. Frontend diagnostics (prefetch
progress, rate limits) go to `<Steam>/millennium/logs/steam-library-scores_log.log`.

Refresh the test fixtures from live Steam data with
`node scripts/capture-fixtures.mjs <appid>...` (it makes the same requests as the backend).

The Lua backend has no unit tests (no local Lua test runner); it is kept thin and checked live.

## Credits

Library page detection is adapted from
[hltb-millennium-plugin](https://github.com/jcdoll/hltb-millennium-plugin) (MIT), and library
list row lookup from [protondb-library-badges](https://github.com/Yohlo/protondb-library-badges)
(MIT). See `NOTICE`.

## License

MIT, see `LICENSE`. Third-party code notices are in `NOTICE`.
