import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  localMetacritic,
  parseAllReviews,
  parseRecentRow,
  parseScores,
  parseSteamDb,
} from '../frontend/scores/parse';

const CK3 = 1158310; // Crusader Kings III: recent row, off-topic review bomb
const RTCW = 9010; // Return to Castle Wolfenstein: small recent sample
const BAD_RATS = 34900; // no recent row

const fixture = (appId: number, name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures', String(appId), name), 'utf8');

describe('parseAllReviews', () => {
  it("reads Steam's all-language summary", () => {
    expect(parseAllReviews(fixture(CK3, 'storebrowse.json'))).toEqual({
      percent: 90,
      count: 93534,
      label: 'Very Positive',
    });
  });

  it('reads the trimmed { appid, reviews } item the backend caches', () => {
    const full = JSON.parse(fixture(CK3, 'storebrowse.json'));
    const item = full.response.store_items[0];
    const trimmed = JSON.stringify({ response: { store_items: [{ appid: item.appid, reviews: item.reviews }] } });
    expect(parseAllReviews(trimmed)).toEqual({ percent: 90, count: 93534, label: 'Very Positive' });
  });

  it('returns null when the game has no reviews', () => {
    const body = JSON.stringify({
      response: {
        store_items: [
          {
            appid: 1,
            reviews: {
              summary_filtered: { review_count: 0, percent_positive: 0, review_score: 0, review_score_label: '' },
            },
          },
        ],
      },
    });
    expect(parseAllReviews(body)).toBeNull();
  });

  it('returns null for a missing, empty or malformed body', () => {
    expect(parseAllReviews(null)).toBeNull();
    expect(parseAllReviews('')).toBeNull();
    expect(parseAllReviews('<html>error</html>')).toBeNull();
    expect(parseAllReviews(JSON.stringify({ response: {} }))).toBeNull();
  });
});

describe('parseSteamDb', () => {
  it('rates from all reviews including off-topic ones', () => {
    const result = parseSteamDb(fixture(CK3, 'appreviews.json'));
    expect(result?.count).toBe(154321);
    expect(result?.rating).toBeCloseTo(84.35, 1);
  });

  it('returns null when there are no reviews or the body is bad', () => {
    const empty = JSON.stringify({
      success: 1,
      query_summary: { num_reviews: 0, review_score: 0, review_score_desc: 'No user reviews', total_positive: 0, total_negative: 0, total_reviews: 0 },
      reviews: [],
      cursor: '*',
    });
    expect(parseSteamDb(empty)).toBeNull();
    expect(parseSteamDb('not json')).toBeNull();
    expect(parseSteamDb(undefined)).toBeNull();
  });
});

describe('localMetacritic', () => {
  it("uses the score from Steam's app overview and links to a Metacritic search", () => {
    expect(localMetacritic(91, 'Crusader Kings III')).toEqual({
      score: 91,
      url: 'https://www.metacritic.com/search/Crusader%20Kings%20III/',
    });
  });

  it('returns null when Steam has no score (0 or missing)', () => {
    expect(localMetacritic(0, 'Bad Rats')).toBeNull();
    expect(localMetacritic(undefined, 'Bad Rats')).toBeNull();
    expect(localMetacritic(Number.NaN, 'Bad Rats')).toBeNull();
  });

  it('has no link without a game name', () => {
    expect(localMetacritic(75, undefined)).toEqual({ score: 75, url: null });
  });
});
describe('parseRecentRow', () => {
  it('reads the recent summary, ignoring the off-topic note', () => {
    expect(parseRecentRow(fixture(CK3, 'recent_row.html'))).toEqual({
      percent: 88,
      count: 415,
      label: 'Very Positive',
    });
  });

  it('reads a small recent sample', () => {
    expect(parseRecentRow(fixture(RTCW, 'recent_row.html'))).toEqual({
      percent: 92,
      count: 54,
      label: 'Very Positive',
    });
  });

  it('returns null when the first row is not a recent-reviews row', () => {
    expect(parseRecentRow(fixture(BAD_RATS, 'recent_row.html'))).toBeNull();
  });

  it('reads counts with thousands separators', () => {
    const html = fixture(RTCW, 'recent_row.html').replace(/92% of the 54 user/g, '71% of the 1,234 user');
    expect(parseRecentRow(html)).toEqual({ percent: 71, count: 1234, label: 'Very Positive' });
  });

  it('returns null for missing or empty input', () => {
    expect(parseRecentRow(null)).toBeNull();
    expect(parseRecentRow('')).toBeNull();
  });
});

describe('parseScores', () => {
  it('combines the fetched sources with the local Metacritic score', () => {
    const scores = parseScores(
      CK3,
      {
        storebrowse: fixture(CK3, 'storebrowse.json'),
        appreviews: fixture(CK3, 'appreviews.json'),
        recent_row: fixture(CK3, 'recent_row.html'),
      },
      { metacriticScore: 91, name: 'Crusader Kings III' },
    );
    expect(scores.reviews).toEqual({ percent: 90, count: 93534, label: 'Very Positive' });
    expect(scores.recent).toEqual({ percent: 88, count: 415, label: 'Very Positive' });
    expect(scores.steamdb?.count).toBe(154321);
    expect(scores.metacritic?.score).toBe(91);
  });

  it('leaves missing sources as null, including a stored "no recent row"', () => {
    expect(
      parseScores(BAD_RATS, { storebrowse: fixture(BAD_RATS, 'storebrowse.json'), recent_row: false }, {}),
    ).toEqual({
      reviews: { percent: 77, count: 7059, label: 'Mostly Positive' },
      recent: null,
      steamdb: null,
      metacritic: null,
    });
  });
});