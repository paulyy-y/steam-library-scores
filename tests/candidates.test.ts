import { describe, expect, it } from 'bun:test';
import { prefetchOrder, type LibraryApp } from '../frontend/prefetch/candidates';

const DAY = 86400;
const NOW = 1791000000;

const app = (appId: number, daysAgo: number | null, installed = false): LibraryApp => ({
  appId,
  lastPlayed: daysAgo === null ? 0 : NOW - daysAgo * DAY,
  installed,
});

describe('prefetchOrder', () => {
  it('puts rows visible in the list first, then recently played, then installed', () => {
    const apps = [app(1, 200, true), app(2, 5), app(3, null, true), app(4, 30), app(5, 400)];
    expect(prefetchOrder(apps, [5], NOW)).toEqual([5, 2, 4, 1, 3]);
  });

  it('orders recently played by most recent first and counts 90 days as recent', () => {
    const apps = [app(1, 90), app(2, 1), app(3, 91)];
    expect(prefetchOrder(apps, [], NOW)).toEqual([2, 1]);
  });

  it('orders installed games by most recently played, never-played last', () => {
    const apps = [app(1, null, true), app(2, 300, true), app(3, 200, true)];
    expect(prefetchOrder(apps, [], NOW)).toEqual([3, 2, 1]);
  });

  it('lists each game once and skips games that are neither visible, recent nor installed', () => {
    const apps = [app(1, 5, true), app(2, 500)];
    expect(prefetchOrder(apps, [1, 1], NOW)).toEqual([1]);
  });

  it('skips non-Steam shortcuts everywhere', () => {
    const shortcut = 0x80000001;
    const apps = [app(shortcut, 1, true), app(7, 2)];
    expect(prefetchOrder(apps, [shortcut], NOW)).toEqual([7]);
  });

  it('includes visible games even when they are not in the app list', () => {
    expect(prefetchOrder([], [42], NOW)).toEqual([42]);
  });
});
