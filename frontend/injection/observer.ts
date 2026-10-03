// Navigation handling adapted from jcdoll/hltb-millennium-plugin
// (MIT License, Copyright (c) jcdoll). See NOTICE.
import { buildCells } from '../scores/format';
import { parseScores } from '../scores/parse';
import type { RawSources, ScoreKey } from '../scores/types';
import { fetchGame, getCached, SCORE_FOR_SOURCE, type SourceKey } from '../services/backend';
import { localAppData } from '../lib/steam';
import { log } from '../services/logger';
import { getSettings } from '../services/settings';
import type { UIMode } from '../types';
import { createDisplay, getExistingDisplay, removeExistingDisplay } from '../display/components';
import { injectStyles } from '../display/styles';
import { clearRoutePatchAppId, detectGamePage, setRoutePatchAppId } from './detector';

type Pending = Partial<Record<ScoreKey, boolean>>;

let currentAppId: number | null = null;
let currentRaw: RawSources | null = null;
let currentPending: Pending = {};
let processingAppId: number | null = null;
let failedAppId: number | null = null;
let currentDoc: Document | null = null;
let currentMode: UIMode | null = null;
let observer: MutationObserver | null = null;
let routePatchCleanup: (() => void) | null = null;

function anyScoreEnabled(): boolean {
  const s = getSettings();
  return s.showReviews || s.showRecent || s.showSteamDb || s.showMetacritic;
}

const pendingFor = (missing: SourceKey[]): Pending =>
  Object.fromEntries(missing.map((key) => [SCORE_FOR_SOURCE[key], true]));

function render(doc: Document, appId: number, raw: RawSources | null, pending: Pending): HTMLElement {
  if (!raw) return createDisplay(doc);
  const scores = parseScores(appId, raw, localAppData(appId));
  return createDisplay(doc, buildCells(appId, scores, getSettings(), pending));
}

function resetState(): void {
  currentAppId = null;
  currentRaw = null;
  currentPending = {};
  processingAppId = null;
  failedAppId = null;
  currentDoc = null;
  currentMode = null;
  clearRoutePatchAppId();
}

// Re-renders the current game's strip, e.g. after a settings change.
export function refreshDisplay(): void {
  if (!currentDoc || !currentMode || !currentAppId || !currentRaw) return;
  if (!anyScoreEnabled()) {
    removeExistingDisplay(currentDoc);
    return;
  }
  const fresh = render(currentDoc, currentAppId, currentRaw, currentPending);
  const existing = getExistingDisplay(currentDoc);
  if (existing) {
    existing.replaceWith(fresh);
    return;
  }
  const page = detectGamePage(currentDoc, currentMode);
  if (page && page.appId === currentAppId) {
    page.container.style.position = 'relative';
    page.container.appendChild(fresh);
  }
}

async function handleGamePage(doc: Document, mode: UIMode): Promise<void> {
  if (!anyScoreEnabled()) {
    removeExistingDisplay(doc);
    return;
  }

  const page = detectGamePage(doc, mode);
  if (!page) {
    if (mode === 'bigpicture') clearRoutePatchAppId();
    return;
  }
  const { appId, container } = page;

  // MutationObserver fires constantly; skip while this app is loading, already
  // shown, or failed (retried after navigating to another game and back).
  if (appId === processingAppId || appId === failedAppId) return;
  const existing = getExistingDisplay(doc);
  if (appId === currentAppId && existing && existing.children.length > 0) return;

  // Reuse data we already have for this app (Steam re-renders the hero on hover).
  const known = appId === currentAppId ? currentRaw : null;
  processingAppId = appId;
  currentAppId = appId;
  currentRaw = known;
  if (!known) currentPending = {};
  currentDoc = doc;
  failedAppId = null;

  const show = (raw: RawSources, pending: Pending) => {
    if (currentAppId !== appId) return;
    currentRaw = raw;
    currentPending = pending;
    getExistingDisplay(doc)?.replaceWith(render(doc, appId, raw, pending));
  };

  try {
    removeExistingDisplay(doc);
    container.style.position = 'relative';
    container.appendChild(render(doc, appId, known, currentPending));
    if (known) return;

    // Whatever is cached (often everything, thanks to prefetch) shows at once.
    const cached = await getCached(appId);
    if (currentAppId !== appId) return;
    if (!cached) {
      failedAppId = appId;
      removeExistingDisplay(doc);
      return;
    }
    show(cached.raw, pendingFor(cached.missing));
    if (cached.missing.length === 0 && cached.stale.length === 0) return;

    // Fetch only what is missing or stale; sources that still fail show "--".
    const fetched = await fetchGame(appId);
    show(fetched ? fetched.raw : cached.raw, {});
  } finally {
    if (processingAppId === appId) processingAppId = null;
  }
}
// Big Picture: read the app id from the library app route's render props.
function setupRoutePatch(): void {
  const routerHook = (window as any).__ROUTER_HOOK_INSTANCE;
  if (!routerHook) {
    log('Router hook not available, Big Picture will use the image fallback');
    return;
  }

  const patchFn = (props: any) => {
    const renderFunc = props.children?.props?.renderFunc;
    if (renderFunc) {
      const original = renderFunc;
      props.children.props.renderFunc = (...args: any[]) => {
        const ret = original(...args);
        const appId = ret?.props?.children?.props?.overview?.appid;
        if (appId) setRoutePatchAppId(appId);
        return ret;
      };
    }
    return props;
  };

  const EUIMODE_GAMEPAD = 4;
  routerHook.addPatch('/library/app/:appid', patchFn, EUIMODE_GAMEPAD);
  routePatchCleanup = () => routerHook.removePatch('/library/app/:appid', patchFn, EUIMODE_GAMEPAD);
}

export function disconnectObserver(): void {
  observer?.disconnect();
  observer = null;
  routePatchCleanup?.();
  routePatchCleanup = null;
}

export function setupObserver(doc: Document, mode: UIMode): void {
  disconnectObserver();
  resetState();
  currentMode = mode;
  injectStyles(doc);
  if (mode === 'bigpicture') setupRoutePatch();

  observer = new MutationObserver(() => {
    handleGamePage(doc, mode);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  log('Watching', mode, 'library');

  handleGamePage(doc, mode);
}
