import { useState } from 'react';
import { definePlugin, DialogButton, Field, IconsModule, Millennium } from '@steambrew/client';
import { removeExistingDisplay } from './display/components';
import { removeStyles } from './display/styles';
import { refreshDisplay, setupObserver } from './injection/observer';
import { startPrefetch } from './prefetch/run';
import { ClearCache } from './services/backend';
import { log } from './services/logger';
import { getSettings, initSettings, saveSettings, type PluginSettings } from './services/settings';
import type { UIMode } from './types';

let currentDocument: Document | undefined;
let currentMode: UIMode | undefined;
let stopPrefetch: (() => void) | null = null;

const TOGGLES: { key: keyof PluginSettings; label: string; description: string }[] = [
  { key: 'showReviews', label: 'Reviews', description: "Steam's all-language review score" },
  { key: 'showRecent', label: 'Recent reviews', description: 'Reviews from the last 30 days' },
  { key: 'showSteamDb', label: 'SteamDB rating', description: "SteamDB's formula over all reviews" },
  { key: 'showMetacritic', label: 'Metacritic', description: 'Critic score, when Steam lists one' },
];

const SettingsContent = () => {
  const [settings, setSettings] = useState<PluginSettings>(getSettings());
  const [message, setMessage] = useState('');

  const onToggle = async (key: keyof PluginSettings, checked: boolean) => {
    const next = { ...getSettings(), [key]: checked };
    setSettings(next);
    await saveSettings(next);
    refreshDisplay();
  };

  const onClearCache = async () => {
    try {
      const result = JSON.parse((await ClearCache()) || '{}');
      setMessage(result.success ? 'Cache cleared' : 'Failed to clear cache');
    } catch {
      setMessage('Failed to clear cache');
    }
  };

  return (
    <>
      {TOGGLES.map(({ key, label, description }) => (
        <Field key={key} label={label} description={description} bottomSeparator="standard">
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(e) => onToggle(key, e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
        </Field>
      ))}
      <Field label="Clear cache" description="Scores refresh every 12 hours on their own" bottomSeparator="standard">
        <DialogButton onClick={onClearCache} style={{ padding: '4px 12px' }}>
          Clear
        </DialogButton>
      </Field>
      {message && <div style={{ fontSize: '12px', color: '#8f98a0', padding: '8px 0' }}>{message}</div>}
    </>
  );
};

export default definePlugin(() => {
  initSettings().then(refreshDisplay);

  Millennium.AddWindowCreateHook?.((context: any) => {
    // Main Steam windows only: "SP Desktop_uid0" or "SP BPM_uid0".
    if (!context.m_strName?.startsWith('SP ')) return;
    const doc: Document | undefined = context.m_popup?.document;
    if (!doc?.body) return;

    const mode: UIMode = context.m_strName.includes('BPM') ? 'bigpicture' : 'desktop';
    if (currentDocument && (currentDocument !== doc || currentMode !== mode)) {
      removeStyles(currentDocument);
      removeExistingDisplay(currentDocument);
    }
    currentDocument = doc;
    currentMode = mode;
    log('Window created:', context.m_strName);
    setupObserver(doc, mode);

    // One prefetcher; it follows the desktop window, whose list rows guide what to fetch.
    if (!stopPrefetch || mode === 'desktop') {
      stopPrefetch?.();
      stopPrefetch = startPrefetch(doc);
    }
  });

  return {
    title: 'Library Scores',
    icon: <IconsModule.Settings />,
    content: <SettingsContent />,
  };
});
