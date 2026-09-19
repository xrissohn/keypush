// Shared, client-safe types for the KeyP × Daytona Opportunity Agent.
import type { ResearchEngine, SourceEvidence } from "@/lib/research/types";

export interface Opportunity {
  id: string;
  title: string;
  category: string;
  deadline: string;
  organizer: string;
  location: string;
  matchScore: number;
  why: string;
  url: string;
  /** true when this is preloaded demo/sample data, not a live verified listing */
  sample?: boolean;
  /* ── live-research provenance (absent on sample data) ── */
  discoveredBy?: ResearchEngine[];
  sourceType?: "official" | "web" | "x";
  sourceEvidence?: SourceEvidence[];
  xEvidence?: SourceEvidence[];
  verified?: boolean;
  confidence?: number;
  summary?: string;
}


export interface CompanyProfile {
  company: string;
  location: string;
  industry: string;
  companyType: string;
  interests: string[];
}

export const SAMPLE_COMPANY_PROFILE: CompanyProfile = {
  company: "XrisP",
  location: "Seoul",
  industry: "AI / Content / Education",
  companyType: "Startup / SME",
  interests: [
    "AI grants",
    "startup programs",
    "hackathons",
    "government funding",
  ],
};

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface RunStep {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  at?: string;
}

export const RUN_STEP_LABELS: Array<{ key: string; label: string; ko: string }> = [
  { key: "sandbox", label: "Sandbox created", ko: "샌드박스 생성" },
  { key: "source", label: "Opportunity source prepared", ko: "기회 데이터 준비" },
  { key: "requirements", label: "Requirements extracted", ko: "요건 추출" },
  { key: "profile", label: "Company profile analyzed", ko: "기업 프로필 분석" },
  { key: "eligibility", label: "Eligibility checked", ko: "적격성 검증" },
  { key: "package", label: "Application package generated", ko: "지원 패키지 생성" },
];

export interface GeneratedFile {
  name: string;
  path: string;
  content: string;
}

export interface RunResultOk {
  ok: true;
  mode: "real" | "demo";
  sandboxId: string | null;
  opportunity: Opportunity;
  companyProfile: CompanyProfile;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  steps: RunStep[];
  log: string[];
  matchScore: number;
  eligible: "yes" | "review" | "no";
  reasons: string[];
  missingDocuments: string[];
  files: GeneratedFile[];
  /** research engines whose evidence was actually used for this run */
  enginesUsed?: ResearchEngine[];
  evidenceCount?: number;
  xSourceCount?: number;
  /** "gemini" when Gemini reasoned over the evidence, "deterministic" for rule-based fallback */
  eligibilityEngine?: "gemini" | "deterministic";
}


export interface RunResultError {
  ok: false;
  code: "not_configured" | "daytona_error" | "bad_request";
  error: string;
  log?: string[];
  steps?: RunStep[];
}

export type RunResult = RunResultOk | RunResultError;

export interface RunRequest {
  opportunity: Opportunity;
  companyProfile?: CompanyProfile;
  demoMode?: boolean;
}
