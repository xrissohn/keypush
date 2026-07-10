// KeyP shared types — used by server pipeline, public API, and client SDK.
export type SnsPlatform =
  | "youtube"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x"
  | "tiktok"
  | "reddit"
  | "news"
  | "blog"
  | "community"
  | "other";

export interface KeypSource {
  platform: SnsPlatform;
  url: string;
  title: string;
  author?: string;
  publishedAt?: string; // ISO
}

export interface KeypFeedItem {
  id: string;
  interest: string;
  headline: string;
  summary: string;
  keywords: string[];
  credibility: number; // 0-100
  sources: KeypSource[];
  createdAt: string; // ISO
}

export interface KeypSearchRequest {
  interest: string;
  // Optional narrowing hints
  platforms?: SnsPlatform[];
  language?: string; // e.g. "ko"
  limit?: number; // default 5
}

export interface KeypSearchResponse {
  ok: true;
  interest: string;
  plan: {
    intent: string;
    queries: string[];
    targetPlatforms: SnsPlatform[];
  };
  items: KeypFeedItem[];
  generatedAt: string;
}

export interface KeypErrorResponse {
  ok: false;
  error: string;
  code?: string;
}
