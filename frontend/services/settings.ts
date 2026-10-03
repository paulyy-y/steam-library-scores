import { callable } from '@steambrew/client';
import type { ScoreToggles } from '../scores/types';
import { log, logError } from './logger';

export type PluginSettings = ScoreToggles;

const DEFAULT_SETTINGS: PluginSettings = {
  showReviews: true,
  showRecent: true,
  showSteamDb: true,
  showMetacritic: true,
};

const GetSettingsRpc = callable<[], string>('GetSettings');
const SaveSettingsRpc = callable<[{ settings_json: string }], string>('SaveSettings');

let cachedSettings: PluginSettings = { ...DEFAULT_SETTINGS };

export async function initSettings(): Promise<void> {
  try {
    const json = await GetSettingsRpc();
    if (!json) return;
    const result = JSON.parse(json);
    if (result.success && result.data) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...result.data };
      log('Settings loaded');
    }
  } catch (e) {
    logError('Failed to load settings:', e);
  }
}

export function getSettings(): PluginSettings {
  return cachedSettings;
}

export async function saveSettings(settings: PluginSettings): Promise<void> {
  const previous = cachedSettings;
  cachedSettings = settings;
  try {
    const json = await SaveSettingsRpc({ settings_json: JSON.stringify(settings) });
    const result = json ? JSON.parse(json) : null;
    if (!result?.success) {
      logError('Failed to save settings:', result?.error);
      cachedSettings = previous;
    }
  } catch (e) {
    logError('Failed to save settings:', e);
    cachedSettings = previous;
  }
}
