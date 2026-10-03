// Saves real Steam responses as test fixtures, using the same requests and
// recent-row extraction rule as backend/sources.lua.
// Usage: node scripts/capture-fixtures.mjs 1158310 34900 9010
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STORE_COOKIE = 'birthtime=0; wants_mature_content=1; lastagecheckage=1-0-1990';
const ROW_MARKER = 'user_reviews_summary_row';
const ROW_MAX_CHARS = 3000;

const urls = (appId) => ({
  storebrowse:
    'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' +
    encodeURIComponent(
      JSON.stringify({
        ids: [{ appid: appId }],
        context: { language: 'english', country_code: 'US' },
        data_request: { include_reviews: true },
      }),
    ),
  appreviews: `https://store.steampowered.com/appreviews/${appId}?json=1&filter=all&language=all&purchase_type=all&filter_offtopic_activity=0&num_per_page=0`,
  storepage: `https://store.steampowered.com/app/${appId}/?l=english&cc=us`,
});

// Mirrors extract_first_review_row in backend/sources.lua (1-based Lua indices
// translated to 0-based JS indices).
export function extractFirstReviewRow(body) {
  const start = body.indexOf(ROW_MARKER);
  if (start === -1) return null;
  const next = body.indexOf(ROW_MARKER, start + 1);
  const from = Math.max(0, start - 40);
  const end = next === -1 ? from + ROW_MAX_CHARS : Math.min(next, from + ROW_MAX_CHARS);
  return body.slice(from, end);
}

async function capture(appId) {
  const u = urls(appId);
  const dir = join('tests', 'fixtures', String(appId));
  await mkdir(dir, { recursive: true });
  for (const key of ['storebrowse', 'appreviews']) {
    const res = await fetch(u[key]);
    await writeFile(join(dir, `${key}.json`), JSON.stringify(await res.json(), null, 2) + '\n');
  }
  const page = await fetch(u.storepage, { headers: { Cookie: STORE_COOKIE } });
  const row = extractFirstReviewRow(await page.text());
  await writeFile(join(dir, 'recent_row.html'), row ?? '');
  console.log(`captured ${appId}`);
}

for (const id of process.argv.slice(2)) {
  await capture(Number(id));
}
