// Client-safe types for KeyP Context Watch: intent reasoning → source routing →
// evidence verification → match judging → findings.

export type ReasonerEngine = "openai" | "openai-deep" | "lovable";
export type SearchEngine = "grok" | "gemini" | "lovable" | "daytona";

export interface SourceStrategyItem {
  source: string;
  priority: number;
  rationale: string;
  queryHints: string[];
}

export interface ContextPlan {
  normalizedIntent: string;
  intentType: string;
  userGoal: string;
  mustHave: string[];
  shouldHave: string[];
  mustNotHave: string[];
  entities: string[];
  geography: { places: string[]; radiusHint?: string };
  timeWindow: { start?: string; end?: string; urgency: "realtime" | "daily" | "weekly" };
  recencyHours: number;
  sourceStrategy: SourceStrategyItem[];
  generatedQueries: string[];
  evidenceRequirements: string[];
  matchThreshold: number;
  refreshMinutes: number;
  ambiguityScore: number;
  privacyMode: "public_only";
}

export interface ContextEvidence {
  engine: SearchEngine;
  url: string;
  title: string;
  statusCode: number | null;
  snippet: string;
  accessible: boolean;
  isX: boolean;
  /** set when a source was deliberately NOT accessed (private / login-walled) */
  blockedReason?: string;
}

export interface MatchJudgement {
  matchScore: number;
  matchedConstraints: string[];
  missingConstraints: string[];
  contradiction: string[];
  whyMatched: string;
  confidence: number;
}

export interface ContextFinding extends MatchJudgement {
  id?: string;
  dedupeKey: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceType: "official" | "web" | "x" | "community";
  discoveredBy: SearchEngine[];
  verified: boolean;
  evidence: ContextEvidence[];
  firstSeenAt?: string;
  lastSeenAt?: string;
  isNew?: boolean;
}

export interface ContextWatch {
  id: string;
  rawQuery: string;
  intentSummary: string;
  plan: ContextPlan;
  planEngine: string;
  active: boolean;
  refreshMinutes: number;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}

export interface WatchRunResult {
  ok: true;
  watchId: string;
  runId: string;
  plan: ContextPlan;
  planEngine: ReasonerEngine;
  reasonerFallback: boolean;
  enginesUsed: SearchEngine[];
  engineErrors: Array<{ engine: SearchEngine; message: string }>;
  blockedSources: Array<{ host: string; reason: string }>;
  findings: ContextFinding[];
  /** scored below the alert threshold: shown for reference only, never notified or stored */
  nearMisses: ContextFinding[];
  belowThreshold: number;
  logs: string[];
  elapsedMs: number;
}

export interface WatchErrorResult {
  ok: false;
  code: "not_configured" | "bad_request" | "not_found" | "engine_error";
  error: string;
  logs?: string[];
}

export interface EngineStatus {
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

export const CONTEXT_STEPS: Array<{ key: string; ko: string; en: string }> = [
  { key: "reasoning", ko: "의도 해석 (Reasoning)", en: "Intent reasoning" },
  { key: "sources", ko: "소스 전략 수립", en: "Source selection" },
  { key: "search", ko: "Grok / 웹 검색", en: "Grok / Web search" },
  { key: "daytona", ko: "Daytona 심층 확인 (필요 시)", en: "Daytona deep fetch (if needed)" },
  { key: "evidence", ko: "출처 직접 확인", en: "Evidence check" },
  { key: "judge", ko: "조건 일치 판정", en: "Match judge" },
];
