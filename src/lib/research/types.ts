// Shared, client-safe types for the KeyP multi-source research agent.

export type ResearchEngine = "gemini" | "grok" | "lovable";

export interface SourceEvidence {
  engine: ResearchEngine | "daytona";
  url: string;
  title: string;
  statusCode: number | null;
  snippet: string;
  accessible?: boolean;
}

export interface ResearchResultItem {
  id: string;
  title: string;
  category: string;
  /** Never invented. "공식 공고 확인 필요" when no deadline was found. */
  deadline: string;
  organizer: string;
  location: string;
  summary: string;
  why: string;
  matchScore: number;
  url: string;
  sample: false;
  discoveredBy: ResearchEngine[];
  sourceType: "official" | "web" | "x";
  sourceEvidence: SourceEvidence[];
  xEvidence?: SourceEvidence[];
  verified: boolean;
  confidence: number;
}

export interface EngineError {
  engine: ResearchEngine;
  message: string;
}

export interface ResearchResponseOk {
  ok: true;
  sandboxId: string;
  query: string;
  enginesUsed: ResearchEngine[];
  engineErrors: EngineError[];
  /** true when no live search engine (Gemini/Grok) was configured */
  noLiveSearchEngine: boolean;
  liveSearchNote?: string;
  results: ResearchResultItem[];
  logs: string[];
  elapsedMs: number;
}

export interface ResearchResponseError {
  ok: false;
  code: "not_configured" | "daytona_error" | "bad_request";
  error: string;
  logs?: string[];
}

export type ResearchResponse = ResearchResponseOk | ResearchResponseError;

export interface ResearchEngineStatus {
  daytonaConfigured: boolean;
  geminiConfigured: boolean;
  grokConfigured: boolean;
  openaiConfigured: boolean;
  lovableAiAvailable: boolean;
  geminiModel: string;
  grokModel: string;
  openaiModel: string;
  openaiDeepModel: string;
}


export const RESEARCH_STEPS: Array<{ key: string; ko: string; en: string }> = [
  { key: "sandbox", ko: "Daytona 샌드박스 생성", en: "Daytona sandbox created" },
  { key: "gemini", ko: "Gemini Google 검색", en: "Gemini Google Search" },
  { key: "grok", ko: "Grok X + 웹 검색", en: "Grok X + Web Search" },
  { key: "fetch", ko: "출처 URL 직접 확인", en: "Source URLs fetched" },
  { key: "merge", ko: "근거 통합", en: "Evidence merged" },
  { key: "rank", ko: "기회 랭킹", en: "Opportunities ranked" },
];
