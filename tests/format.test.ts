import { describe, expect, it } from 'bun:test';
import { buildCells } from '../frontend/scores/format';
import type { ScoreToggles, Scores } from '../frontend/scores/types';

const CK3 = 1158310;
const ALL_ON: ScoreToggles = { showReviews: true, showRecent: true, showSteamDb: true, showMetacritic: true };

const ck3: Scores = {
  reviews: { percent: 90, count: 93534, label: 'Very Positive' },
  recent: { percent: 88, count: 415, label: 'Very Positive' },
  steamdb: { rating: 84.3522, count: 154321 },
  metacritic: { score: 91, url: 'https://www.metacritic.com/search/Crusader%20Kings%20III/' },
};

const none: Scores = { reviews: null, recent: null, steamdb: null, metacritic: null };

describe('buildCells', () => {
  it('builds the four cells in order with values, labels and links', () => {
    expect(buildCells(CK3, ck3, ALL_ON)).toEqual([
      {
        key: 'reviews',
        value: '90%',
        label: 'Reviews',
        tooltip: 'Very Positive · 90% of 93,534 reviews (all languages)',
        tone: 'positive',
        href: 'steam://openurl/https://store.steampowered.com/app/1158310/#app_reviews_hash',
      },
      {
        key: 'recent',
        value: '88%',
        label: 'Recent',
        tooltip: 'Very Positive · 88% of 415 reviews in the last 30 days',
        tone: 'positive',
        href: 'steam://openurl/https://store.steampowered.com/app/1158310/#app_reviews_hash',
      },
      {
        key: 'steamdb',
        value: '84.35%',
        label: 'SteamDB',
        tooltip: 'SteamDB rating 84.35% from 154,321 reviews',
        tone: 'positive',
        href: 'steam://openurl_external/https://steamdb.info/app/1158310/',
      },
      {
        key: 'metacritic',
        value: '91',
        label: 'Metacritic',
        tooltip: 'Metacritic 91',
        tone: 'positive',
        href: 'steam://openurl_external/https://www.metacritic.com/search/Crusader%20Kings%20III/',
      },
    ]);
  });

  it('shows -- with no link for missing scores', () => {
    expect(buildCells(CK3, none, ALL_ON)).toEqual([
      { key: 'reviews', value: '--', label: 'Reviews', tooltip: 'No user reviews yet', tone: 'none', href: null },
      { key: 'recent', value: '--', label: 'Recent', tooltip: 'Not enough reviews in the last 30 days', tone: 'none', href: null },
      { key: 'steamdb', value: '--', label: 'SteamDB', tooltip: 'No SteamDB rating', tone: 'none', href: null },
      { key: 'metacritic', value: '--', label: 'Metacritic', tooltip: 'No Metacritic score', tone: 'none', href: null },
    ]);
  });

  it('shows a Metacritic score without a link when Steam gives no URL', () => {
    const cells = buildCells(CK3, { ...none, metacritic: { score: 60, url: null } }, ALL_ON);
    expect(cells[3].href).toBeNull();
    expect(cells[3].value).toBe('60');
  });

  it('shows a loading cell for a score still being fetched', () => {
    const cells = buildCells(CK3, { ...none, reviews: ck3.reviews }, ALL_ON, { recent: true, steamdb: true });
    expect(cells[0].value).toBe('90%');
    expect(cells[1]).toEqual({ key: 'recent', value: '…', label: 'Recent', tooltip: 'Loading…', tone: 'none', href: null });
    expect(cells[2]).toEqual({ key: 'steamdb', value: '…', label: 'SteamDB', tooltip: 'Loading…', tone: 'none', href: null });
    expect(cells[3].value).toBe('--');
  });

  it('keeps showing a known score while it refreshes', () => {
    const cells = buildCells(CK3, ck3, ALL_ON, { recent: true, steamdb: true });
    expect(cells.map((c) => c.value)).toEqual(['90%', '88%', '84.35%', '91']);
  });
  it('leaves out scores that are turned off', () => {
    const keys = buildCells(CK3, ck3, { ...ALL_ON, showRecent: false, showMetacritic: false }).map((c) => c.key);
    expect(keys).toEqual(['reviews', 'steamdb']);
  });

  it('returns no cells when every score is turned off', () => {
    const off: ScoreToggles = { showReviews: false, showRecent: false, showSteamDb: false, showMetacritic: false };
    expect(buildCells(CK3, ck3, off)).toEqual([]);
  });

  it('colours review percentages like Steam: 70+ positive, 40-69 mixed, below 40 negative', () => {
    const tone = (percent: number) =>
      buildCells(CK3, { ...none, reviews: { percent, count: 100, label: 'x' } }, ALL_ON)[0].tone;
    expect(tone(70)).toBe('positive');
    expect(tone(69)).toBe('mixed');
    expect(tone(40)).toBe('mixed');
    expect(tone(39)).toBe('negative');
  });

  it('colours the SteamDB rating with the same thresholds', () => {
    const tone = (rating: number) =>
      buildCells(CK3, { ...none, steamdb: { rating, count: 100 } }, ALL_ON)[2].tone;
    expect(tone(70)).toBe('positive');
    expect(tone(69.99)).toBe('mixed');
    expect(tone(39.99)).toBe('negative');
  });

  it('colours Metacritic like Metacritic: 75+ positive, 50-74 mixed, below 50 negative', () => {
    const tone = (score: number) =>
      buildCells(CK3, { ...none, metacritic: { score, url: null } }, ALL_ON)[3].tone;
    expect(tone(75)).toBe('positive');
    expect(tone(74)).toBe('mixed');
    expect(tone(50)).toBe('mixed');
    expect(tone(49)).toBe('negative');
  });
});
