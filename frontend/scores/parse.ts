import { steamDbRating } from './steamdb';
import type { MetacriticScore, RawSources, ReviewScore, Scores, SteamDbScore } from './types';

function parseJson(body: string | null | undefined): any {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// IStoreBrowseService/GetItems: reviews.summary_filtered is Steam's "All Reviews"
// (all languages, Steam purchasers, off-topic activity excluded).
export function parseAllReviews(storebrowseBody: string | null | undefined): ReviewScore | null {
  const summary = parseJson(storebrowseBody)?.response?.store_items?.[0]?.reviews?.summary_filtered;
  if (!summary || !(summary.review_count > 0)) return null;
  return {
    percent: summary.percent_positive,
    count: summary.review_count,
    label: summary.review_score_label,
  };
}

// appreviews with language=all, purchase_type=all and off-topic activity included:
// the same population SteamDB rates.
export function parseSteamDb(appreviewsBody: string | null | undefined): SteamDbScore | null {
  const summary = parseJson(appreviewsBody)?.query_summary;
  if (!summary) return null;
  const rating = steamDbRating(summary.total_positive, summary.total_reviews);
  if (rating === null) return null;
  return { rating, count: summary.total_reviews };
}

// Metacritic score from Steam's local app overview (no request needed). The overview has no
// Metacritic URL, so the link is a Metacritic search for the game.
export function localMetacritic(score: number | undefined, name: string | undefined): MetacriticScore | null {
  if (typeof score !== 'number' || !(score > 0)) return null;
  const url = name ? `https://www.metacritic.com/search/${encodeURIComponent(name)}/` : null;
  return { score, url };
}

const RECENT_SUBTITLE = /<div class="subtitle column[^"]*">\s*Recent Reviews:\s*<\/div>/;
const RECENT_TOOLTIP = /data-tooltip-html="(\d+)% of the ([\d,]+) user reviews in the last 30 days/;
const SUMMARY_LABEL = /<span class="game_review_summary[^"]*"[^>]*>([^<]+)<\/span>/;

// The first review summary row from the store page, as cut out by the backend.
// Steam only shows a "Recent Reviews" row when a game has enough recent reviews.
export function parseRecentRow(html: string | false | null | undefined): ReviewScore | null {
  if (!html || !RECENT_SUBTITLE.test(html)) return null;
  const tooltip = html.match(RECENT_TOOLTIP);
  const label = html.match(SUMMARY_LABEL);
  if (!tooltip || !label) return null;
  return {
    percent: Number(tooltip[1]),
    count: Number(tooltip[2].replace(/,/g, '')),
    label: label[1].trim(),
  };
}

export interface LocalAppData {
  metacriticScore?: number;
  name?: string;
}

export function parseScores(appId: number, raw: RawSources, local: LocalAppData): Scores {
  return {
    reviews: parseAllReviews(raw.storebrowse),
    recent: parseRecentRow(raw.recent_row),
    steamdb: parseSteamDb(raw.appreviews),
    metacritic: localMetacritic(local.metacriticScore, local.name),
  };
}
