// Game page detection adapted from jcdoll/hltb-millennium-plugin
// (MIT License, Copyright (c) jcdoll). See NOTICE.
import type { GamePageInfo, UIMode } from '../types';

// Hero area of a library game page, shared by Desktop and Big Picture.
// Obfuscated Steam class: may change with Steam updates.
const CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';

// Big Picture fallback when the route patch hasn't fired: app id from the hero image URL.
const BIG_PICTURE_IMAGE_SELECTORS = [
  '._3NBxSLAZLbbbnul8KfDFjw._2dzwXkCVAuZGFC-qKgo8XB',
  'img.HNbe3eZf6H7dtJ042x1vM[src*="library_hero"]',
];
const IMAGE_APP_ID = /\/assets\/(\d+)/;

// Non-Steam shortcuts get app ids with the high bit set; Steam has no data for them.
const FIRST_SHORTCUT_APP_ID = 0x80000000;

let routePatchAppId: number | null = null;

export function setRoutePatchAppId(appId: number): void {
  routePatchAppId = appId;
}

export function clearRoutePatchAppId(): void {
  routePatchAppId = null;
}

const isSteamApp = (appId: number) => appId > 0 && appId < FIRST_SHORTCUT_APP_ID;

function findContainer(doc: Document): HTMLElement | null {
  return doc.querySelector(CONTAINER_SELECTOR) as HTMLElement | null;
}

function detectDesktop(doc: Document): GamePageInfo | null {
  const pathname = window.MainWindowBrowserManager?.m_lastLocation?.pathname;
  const match = pathname?.match(/\/app\/(\d+)/);
  if (!match) return null;
  const container = findContainer(doc);
  if (!container) return null;
  return { appId: parseInt(match[1], 10), container };
}

// In Big Picture the pathname is stale, so the app id comes from the route patch
// (see observer.ts), falling back to the hero image URL.
function detectBigPicture(doc: Document): GamePageInfo | null {
  const container = findContainer(doc);
  if (!container) return null;
  if (routePatchAppId) return { appId: routePatchAppId, container };

  for (const selector of BIG_PICTURE_IMAGE_SELECTORS) {
    const img = doc.querySelector(selector) as HTMLImageElement | null;
    const match = img?.src?.match(IMAGE_APP_ID);
    const imgContainer = img?.closest(CONTAINER_SELECTOR) as HTMLElement | null;
    if (match && imgContainer) return { appId: parseInt(match[1], 10), container: imgContainer };
  }
  return null;
}

export function detectGamePage(doc: Document, mode: UIMode): GamePageInfo | null {
  const page = mode === 'desktop' ? detectDesktop(doc) : detectBigPicture(doc);
  return page && isSteamApp(page.appId) ? page : null;
}
