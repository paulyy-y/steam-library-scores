import type { ScoreCell, ScoreKey, ScoreToggles, Scores, Tone } from './types';

const MISSING = '--';

const formatCount = (n: number) => n.toLocaleString('en-US');

// Steam colours a review score blue from 70%, tan from 40%, red below that.
function reviewTone(percent: number): Tone {
  if (percent >= 70) return 'positive';
  if (percent >= 40) return 'mixed';
  return 'negative';
}

// Metacritic: green from 75, yellow from 50, red below that.
function metacriticTone(score: number): Tone {
  if (score >= 75) return 'positive';
  if (score >= 50) return 'mixed';
  return 'negative';
}

const storeReviewsUrl = (appId: number) =>
  `steam://openurl/https://store.steampowered.com/app/${appId}/#app_reviews_hash`;

const external = (url: string) => `steam://openurl_external/${url}`;

// pending: scores still being fetched. They show as loading until a value arrives;
// a score already known keeps showing while it refreshes.
export function buildCells(
  appId: number,
  scores: Scores,
  toggles: ScoreToggles,
  pending: Partial<Record<ScoreKey, boolean>> = {},
): ScoreCell[] {
  const cells: ScoreCell[] = [];
  const { reviews, recent, steamdb, metacritic } = scores;

  if (toggles.showReviews) {
    cells.push(
      reviews
        ? {
            key: 'reviews',
            value: `${reviews.percent}%`,
            label: 'Reviews',
            tooltip: `${reviews.label} · ${reviews.percent}% of ${formatCount(reviews.count)} reviews (all languages)`,
            tone: reviewTone(reviews.percent),
            href: storeReviewsUrl(appId),
          }
        : { key: 'reviews', value: MISSING, label: 'Reviews', tooltip: 'No user reviews yet', tone: 'none', href: null },
    );
  }

  if (toggles.showRecent) {
    cells.push(
      recent
        ? {
            key: 'recent',
            value: `${recent.percent}%`,
            label: 'Recent',
            tooltip: `${recent.label} · ${recent.percent}% of ${formatCount(recent.count)} reviews in the last 30 days`,
            tone: reviewTone(recent.percent),
            href: storeReviewsUrl(appId),
          }
        : {
            key: 'recent',
            value: MISSING,
            label: 'Recent',
            tooltip: 'Not enough reviews in the last 30 days',
            tone: 'none',
            href: null,
          },
    );
  }

  if (toggles.showSteamDb) {
    cells.push(
      steamdb
        ? {
            key: 'steamdb',
            value: `${steamdb.rating.toFixed(2)}%`,
            label: 'SteamDB',
            tooltip: `SteamDB rating ${steamdb.rating.toFixed(2)}% from ${formatCount(steamdb.count)} reviews`,
            tone: reviewTone(steamdb.rating),
            href: external(`https://steamdb.info/app/${appId}/`),
          }
        : { key: 'steamdb', value: MISSING, label: 'SteamDB', tooltip: 'No SteamDB rating', tone: 'none', href: null },
    );
  }

  if (toggles.showMetacritic) {
    cells.push(
      metacritic
        ? {
            key: 'metacritic',
            value: String(metacritic.score),
            label: 'Metacritic',
            tooltip: `Metacritic ${metacritic.score}`,
            tone: metacriticTone(metacritic.score),
            href: metacritic.url ? external(metacritic.url) : null,
          }
        : {
            key: 'metacritic',
            value: MISSING,
            label: 'Metacritic',
            tooltip: 'No Metacritic score',
            tone: 'none',
            href: null,
          },
    );
  }

  return cells.map((cell) =>
    !scores[cell.key] && pending[cell.key]
      ? { ...cell, value: '…', tooltip: 'Loading…', tone: 'none', href: null }
      : cell,
  );
}
