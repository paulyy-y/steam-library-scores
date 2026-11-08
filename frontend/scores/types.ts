// Raw response bodies as returned (and cached) by the Lua backend.
// A missing key means not fetched yet; recent_row is false when the store page has no recent row,
// metacritic is false when Metacritic has no PC game by the Steam name.
export interface RawSources {
  storebrowse?: string | null;
  appreviews?: string | null;
  recent_row?: string | false | null;
  metacritic?: string | false | null;
}

export interface ReviewScore {
  percent: number; // 0-100, as Steam shows it
  count: number;
  label: string; // e.g. "Very Positive"
}

export interface SteamDbScore {
  rating: number; // 0-100
  count: number;
}

export interface MetacriticScore {
  score: number; // critic 0-100, user 0-10
  url: string | null;
  count?: number; // only from Metacritic itself, not Steam's local score
  label?: string; // e.g. "Universal acclaim"
}

export interface Scores {
  reviews: ReviewScore | null;
  recent: ReviewScore | null;
  steamdb: SteamDbScore | null;
  metacritic: MetacriticScore | null;
  metacriticUser: MetacriticScore | null;
}

export type ScoreKey = keyof Scores;

export interface ScoreToggles {
  showReviews: boolean;
  showRecent: boolean;
  showSteamDb: boolean;
  showMetacritic: boolean;
  showMetacriticUser: boolean;
}

export type Tone = 'positive' | 'mixed' | 'negative' | 'none';

export interface ScoreCell {
  key: ScoreKey;
  value: string;
  label: string;
  tooltip: string;
  tone: Tone;
  href: string | null;
}
