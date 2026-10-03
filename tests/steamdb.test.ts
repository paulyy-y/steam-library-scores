import { describe, expect, it } from 'bun:test';
import { steamDbRating } from '../frontend/scores/steamdb';

// SteamDB's published formula:
// rating = avg - (avg - 0.5) * 2^(-log10(total + 1)), avg = positive / total
describe('steamDbRating', () => {
  it('returns null when there are no reviews', () => {
    expect(steamDbRating(0, 0)).toBeNull();
  });

  it('pulls a single positive review strongly towards 50%', () => {
    // avg 1, 2^(-log10 2) = 0.81167 -> 1 - 0.5 * 0.81167 = 0.59417
    expect(steamDbRating(1, 1)).toBeCloseTo(59.42, 1);
  });

  it('keeps an exactly even split at 50%', () => {
    expect(steamDbRating(50, 100)).toBeCloseTo(50, 5);
  });

  it('pulls an all-negative small sample up towards 50%', () => {
    // avg 0, 2^(-log10 11) = 0.48585 -> 0.5 * 0.48585 = 0.24292
    expect(steamDbRating(0, 10)).toBeCloseTo(24.29, 1);
  });

  it('lands within 0.1 of the 84.30% SteamDB showed for Crusader Kings III', () => {
    // SteamDB counted 154,505 reviews that day; Steam's API returned 131,668 / 154,321.
    const rating = steamDbRating(131668, 154321);
    expect(rating).not.toBeNull();
    expect(Math.abs((rating as number) - 84.3)).toBeLessThan(0.1);
  });
});
