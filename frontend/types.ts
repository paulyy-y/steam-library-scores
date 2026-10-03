export type UIMode = 'desktop' | 'bigpicture';

export interface GamePageInfo {
  appId: number;
  container: HTMLElement;
}

declare global {
  interface Window {
    MainWindowBrowserManager?: {
      m_lastLocation: {
        pathname: string;
      };
    };
  }
}
