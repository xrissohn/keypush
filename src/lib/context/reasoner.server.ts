// Server-only: OpenAI Intent & Context Reasoner.
// OpenAI is NOT a search engine here. It (1) structures the user's natural-language
// intent into a ContextPlan with a source strategy, and (2) judges search results
// against that plan. Falls back to Lovable AI when OPENAI_API_KEY is absent or the
// call fails — the fallback is always reported, never hidden.

import type { ContextPlan, ContextEvidence, MatchJudgement, ReasonerEngine } from "./types";

const PRIVACY_RULES = [
  "PRIVACY / SAFETY RULES (non-negotiable):",
  "- public_only: never plan to access private accounts, logged-in dating app profiles, DMs, or anything behind a login, paywall, CAPTCHA or robots.txt disallow.",
  "- Never target minors. For anything person-related, require that the person publicly states they are 18+ (or the platform/source explicitly states adult-only).",
  "- Never infer gender, age, ethnicity, religion, health, sexual orientation or dating intent from photos or names. Only accept attributes the person stated publicly in text.",
  "- Person-related findings require a public self-statement plus a public source URL. Put those requirements in evidenceRequirements and mustHave.",
  "- Put private/login-walled platforms into mustNotHave so the router never touches them.",
].join("\n");

export function getReasonerConfig() {
  return {
    openaiKey: process.env["OPENAI_API_KEY"] || "",
    openaiConfigured: Boolean(process.env["OPENAI_API_KEY"]),
    model: process.env["OPENAI_REASONING_MODEL"] || "gpt-5.6-terra",
    deepModel: process.env["OPENAI_DEEP_REASONING_MODEL"] || "gpt-5.6-sol",
    lovableKey: process.env["LOVABLE_API_KEY"] || "",
  };
}

/* ─────────── raw model calls (text in → text out) ─────────── */

async function callOpenAI(prompt: string, model: string): Promise<string> {
  const { openaiKey } = getReasonerConfig();
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: "medium" },
      store: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    // never echo the key or full provider payload
    throw new Error(`OpenAI Responses API HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = JSON.parse(text) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  let out = "";
  for (const item of data.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") out += c.text;
    }
  }
  return out;
}

/** Lovable AI gateway fallback (streamed so long reasoning survives timeouts). */
export async function callLovable(prompt: string): Promise<string> {
  const { lovableKey } = getReasonerConfig();
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "low",
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Lovable AI gateway HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") text += delta;
      } catch {
        /* partial SSE chunk */
      }
    }
  }
  return text;
}

export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([[{][\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const starts = [body.indexOf("{"), body.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const endChar = body[start] === "{" ? "}" : "]";
  const end = body.lastIndexOf(endChar);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/* ─────────── 1) intent → ContextPlan ─────────── */

const PLAN_SCHEMA = `{
  "normalizedIntent": string,
  "intentType": string,
  "userGoal": string,
  "mustHave": string[],
  "shouldHave": string[],
  "mustNotHave": string[],
  "entities": string[],
  "geography": { "places": string[], "radiusHint": string },
  "timeWindow": { "start": ISO8601 string, "end": ISO8601 string, "urgency": "realtime"|"daily"|"weekly" },
  "recencyHours": number,
  "sourceStrategy": [{ "source": string, "priority": number, "rationale": string, "queryHints": string[] }],
  "generatedQueries": string[],
  "evidenceRequirements": string[],
  "matchThreshold": number,
  "refreshMinutes": number,
  "ambiguityScore": number,
  "privacyMode": "public_only"
}`;

function planPrompt(rawQuery: string, nowIso: string, previous?: ContextPlan) {
  return [
    "You are KeyP's Intent & Context Reasoner. You do NOT search. You structure the user's",
    "natural-language intent (goal, context, time, place, conditions, negative conditions)",
    "and design a source strategy: where such a PUBLIC signal would surface first and fastest.",
    "",
    `Server current time (UTC, ISO8601): ${nowIso}`,
    'Resolve relative expressions ("today", "this week", "next week", "within 7 days") into real ISO dates from that timestamp.',
    "",
    PRIVACY_RULES,
    "",
    "sourceStrategy guidance: X/Twitter and realtime social for live personal/public posts;",
    "official government / organizer / program sites and news for formal announcements;",
    "public communities (e.g. Reddit public pages) only via public pages or permitted APIs.",
    "matchThreshold: 0-100, higher for person-related or high-precision intents (>=75).",
    'refreshMinutes: realtime 15-30, daily 360-1440, weekly 1440+. Minimum 15.',
    "ambiguityScore: 0-100, how ambiguous or multi-part the request is.",
    "",
    previous
      ? `A first-pass plan already exists; improve it — sharpen constraints, source strategy and queries.\nPrevious plan: ${JSON.stringify(previous)}`
      : "",
    `User request (verbatim): ${rawQuery}`,
    "",
    `Return ONLY JSON (no prose, no markdown fences) matching this shape:\n${PLAN_SCHEMA}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePlan(input: unknown, rawQuery: string): ContextPlan {
  const o = (input ?? {}) as Record<string, any>;
  const arr = (v: unknown, cap = 12): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, cap) : [];
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def;
  };
  const urgency = ["realtime", "daily", "weekly"].includes(o["timeWindow"]?.urgency)
    ? (o["timeWindow"].urgency as ContextPlan["timeWindow"]["urgency"])
    : "daily";
  const strategy = Array.isArray(o["sourceStrategy"]) ? o["sourceStrategy"] : [];
  return {
    normalizedIntent: String(o["normalizedIntent"] || rawQuery).slice(0, 600),
    intentType: String(o["intentType"] || "general").slice(0, 80),
    userGoal: String(o["userGoal"] || "").slice(0, 600),
    mustHave: arr(o["mustHave"]),
    shouldHave: arr(o["shouldHave"]),
    mustNotHave: arr(o["mustNotHave"]),
    entities: arr(o["entities"]),
    geography: {
      places: arr(o["geography"]?.places, 8),
      ...(typeof o["geography"]?.radiusHint === "string" ? { radiusHint: o["geography"].radiusHint } : {}),
    },
    timeWindow: {
      ...(typeof o["timeWindow"]?.start === "string" ? { start: o["timeWindow"].start } : {}),
      ...(typeof o["timeWindow"]?.end === "string" ? { end: o["timeWindow"].end } : {}),
      urgency,
    },
    recencyHours: num(o["recencyHours"], urgency === "realtime" ? 48 : 336, 1, 8760),
    sourceStrategy: strategy
      .slice(0, 8)
      .map((s: any, i: number) => ({
        source: String(s?.source || `source-${i + 1}`).slice(0, 80),
        priority: num(s?.priority, i + 1, 1, 10),
        rationale: String(s?.rationale || "").slice(0, 300),
        queryHints: arr(s?.queryHints, 6),
      }))
      .sort((a, b) => a.priority - b.priority),
    generatedQueries: arr(o["generatedQueries"], 8),
    evidenceRequirements: arr(o["evidenceRequirements"], 10),
    matchThreshold: num(o["matchThreshold"], 65, 0, 100),
    refreshMinutes: Math.max(num(o["refreshMinutes"], urgency === "realtime" ? 30 : 720, 15, 20160), 15),
    ambiguityScore: num(o["ambiguityScore"], 40, 0, 100),
    privacyMode: "public_only",
  };
}

export interface PlanOutcome {
  plan: ContextPlan;
  engine: ReasonerEngine;
  fallback: boolean;
  escalated: boolean;
  logs: string[];
}

export async function buildContextPlan(rawQuery: string): Promise<PlanOutcome> {
  const cfg = getReasonerConfig();
  const nowIso = new Date().toISOString();
  const logs: string[] = [];
  const log = (m: string) => logs.push(`[reasoner] ${m}`);

  if (cfg.openaiConfigured) {
    try {
      log(`openai responses api · model=${cfg.model} · effort=medium`);
      const text = await callOpenAI(planPrompt(rawQuery, nowIso), cfg.model);
      let plan = normalizePlan(extractJson(text), rawQuery);
      let engine: ReasonerEngine = "openai";
      let escalated = false;
      // cost control: escalate once, only for genuinely ambiguous / multi-part intents
      if (plan.ambiguityScore >= 60) {
        try {
          log(`ambiguity ${plan.ambiguityScore} >= 60 → escalating once to ${cfg.deepModel}`);
          const deep = await callOpenAI(planPrompt(rawQuery, nowIso, plan), cfg.deepModel);
          const deepPlan = extractJson(deep);
          if (deepPlan) {
            plan = normalizePlan(deepPlan, rawQuery);
            engine = "openai-deep";
            escalated = true;
          }
        } catch (e) {
          log(`escalation failed, keeping ${cfg.model} plan — ${(e as Error).message.slice(0, 160)}`);
        }
      } else {
        log(`ambiguity ${plan.ambiguityScore} < 60 → no deep-model escalation (cost saved)`);
      }
      return { plan, engine, fallback: false, escalated, logs };
    } catch (e) {
      log(`openai failed → Lovable AI fallback — ${(e as Error).message.slice(0, 200)}`);
    }
  } else {
    log("OPENAI_API_KEY not configured → Lovable AI planner fallback");
  }

  const text = await callLovable(planPrompt(rawQuery, nowIso));
  const plan = normalizePlan(extractJson(text), rawQuery);
  log("plan produced by Lovable AI fallback planner (not OpenAI reasoning)");
  return { plan, engine: "lovable", fallback: true, escalated: false, logs };
}

/* ─────────── 2) evidence → match judgement ─────────── */

export interface JudgeCandidate {
  key: string;
  title: string;
  url: string;
  sourceType: string;
  snippet: string;
  evidence: ContextEvidence[];
}

const JUDGE_SCHEMA = `[{ "key": string, "matchScore": 0-100, "matchedConstraints": string[], "missingConstraints": string[], "contradiction": string[], "whyMatched": string (2-3 sentences), "confidence": 0-100, "summary": string }]`;

export async function judgeCandidates(
  plan: ContextPlan,
  candidates: JudgeCandidate[],
): Promise<{ judgements: Record<string, MatchJudgement & { summary: string }>; engine: ReasonerEngine; fallback: boolean; logs: string[] }> {
  const cfg = getReasonerConfig();
  const logs: string[] = [];
  const out: Record<string, MatchJudgement & { summary: string }> = {};
  if (!candidates.length) return { judgements: out, engine: cfg.openaiConfigured ? "openai" : "lovable", fallback: !cfg.openaiConfigured, logs };

  const prompt = [
    "You are KeyP's Evidence-based Match Judge. Compare each candidate's evidence against the",
    "ContextPlan. Judge ONLY from the evidence text given — never infer attributes from names,",
    "photos or assumptions, and never treat an inaccessible source as confirmed.",
    "",
    PRIVACY_RULES,
    "",
    "If a person-related candidate lacks an explicit public self-statement plus a public source",
    "URL, set matchScore to 0 and explain the missing constraint. Keep any quoted snippet very",
    "short (max ~20 words). Never invent dates, deadlines or facts not present in the evidence.",
    "",
    "SCORING RUBRIC (use the full range — do not collapse everything to 0):",
    "  85-100: the evidence shows every checkable mustHave condition is satisfied.",
    "  70-84 : the core intent and place/time conditions are satisfied; some details still need",
    "          confirmation on the official page, or depend on information the user did not provide",
    "          (their own company size, age, profile). Those go in missingConstraints — they must",
    "          NOT drag the score to 0.",
    "  50-69 : clearly on-topic and useful but a key condition is unconfirmed or borderline.",
    "  20-49 : loosely related (background article, listing page with no concrete match).",
    "  0-19  : off-topic, contradicts mustNotHave, or a person-related hit with no public",
    "          self-statement (this safety rule always wins).",
    "",
    `ContextPlan: ${JSON.stringify(plan)}`,
    `Candidates: ${JSON.stringify(
      candidates.map((c) => ({
        key: c.key,
        title: c.title,
        url: c.url,
        sourceType: c.sourceType,
        evidence: c.evidence.map((e) => ({
          engine: e.engine,
          url: e.url,
          accessible: e.accessible,
          statusCode: e.statusCode,
          snippet: e.snippet.slice(0, 500),
          blockedReason: e.blockedReason,
        })),
      })),
    )}`,
    "",
    `Answer in the user's language where natural (Korean input → Korean whyMatched/summary).`,
    `Return ONLY JSON (no prose, no fences): ${JUDGE_SCHEMA}`,
  ].join("\n");

  let text = "";
  let engine: ReasonerEngine = "lovable";
  let fallback = true;
  if (cfg.openaiConfigured) {
    try {
      text = await callOpenAI(prompt, cfg.model);
      engine = "openai";
      fallback = false;
      logs.push(`[judge] openai ${cfg.model} judged ${candidates.length} candidates`);
    } catch (e) {
      logs.push(`[judge] openai failed → Lovable AI fallback — ${(e as Error).message.slice(0, 160)}`);
    }
  } else {
    logs.push("[judge] OPENAI_API_KEY not configured → Lovable AI fallback judge");
  }
  if (!text) {
    text = await callLovable(prompt);
  }

  let parsed = extractJson<Array<Record<string, any>>>(text);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    logs.push(`[judge] first parse failed (len ${text.length}) → compact retry`);
    const retry = await callLovable(
      `${prompt}\n\nIMPORTANT: output MUST be a single compact JSON array, one object per candidate key, nothing else.`,
    ).catch(() => "");
    parsed = extractJson<Array<Record<string, any>>>(retry);
    if (!Array.isArray(parsed) || parsed.length === 0) logs.push("[judge] judge output unparsable — no findings reported");
  }
  for (const r of Array.isArray(parsed) ? parsed : []) {
    const key = String(r?.["key"] ?? "");
    if (!key) continue;
    const clamp = (v: unknown, def = 0) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 100) : def;
    };
    const strArr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 10).map((s: string) => s.slice(0, 200)) : [];
    out[key] = {
      matchScore: clamp(r?.["matchScore"]),
      matchedConstraints: strArr(r?.["matchedConstraints"]),
      missingConstraints: strArr(r?.["missingConstraints"]),
      contradiction: strArr(r?.["contradiction"]),
      whyMatched: String(r?.["whyMatched"] ?? "").slice(0, 700),
      confidence: clamp(r?.["confidence"]),
      summary: String(r?.["summary"] ?? "").slice(0, 700),
    };
  }
  return { judgements: out, engine, fallback, logs };
}
