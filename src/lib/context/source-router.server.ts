// Server-only: Source Router. Follows the ContextPlan's sourceStrategy, searches the
// most promising PUBLIC sources first, verifies candidate URLs with a real HTTP GET,
// and only spins up a Daytona sandbox on demand for deep work (JS/PDF/multi-link),
// destroying it immediately afterwards. Daytona is never left running.

import { callLovable, extractJson } from "./reasoner.server";
import type { ContextEvidence, ContextPlan, SearchEngine } from "./types";

const UA = "Mozilla/5.0 (compatible; KeyPContextWatch/1.0; +https://lovable.dev)";

/** Sources we deliberately never access: private, login-walled or app-only. */
const BLOCKED_HOSTS: Array<{ host: string; reason: string }> = [
  { host: "tinder.com", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "bumble.com", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "hinge.co", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "okcupid.com", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "match.com", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "coffeemeetsbagel.com", reason: "데이팅앱 비공개 프로필 — 접근하지 않음" },
  { host: "facebook.com", reason: "로그인 필요 영역 — 공개 페이지 외 접근하지 않음" },
  { host: "instagram.com", reason: "로그인 필요 영역 — 공개 페이지 외 접근하지 않음" },
  { host: "linkedin.com", reason: "로그인 필요 영역 — 접근하지 않음" },
];

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
function blockedFor(u: string) {
  const h = hostOf(u);
  return BLOCKED_HOSTS.find((b) => h === b.host || h.endsWith(`.${b.host}`));
}
function isX(u: string) {
  const h = hostOf(u);
  return h === "x.com" || h === "twitter.com" || h.endsWith(".x.com") || h.endsWith(".twitter.com");
}
function sourceTypeOf(u: string): "official" | "web" | "x" | "community" {
  const h = hostOf(u);
  if (isX(u)) return "x";
  if (/\.(go\.kr|gov|gov\.[a-z]{2}|edu|ac\.kr)$/.test(h) || /(^|\.)(k-startup\.go\.kr|devpost\.com)$/.test(h))
    return "official";
  if (/(^|\.)(reddit\.com|news\.ycombinator\.com|discourse\.|quora\.com)/.test(h)) return "community";
  return "web";
}

export interface RawCandidate {
  title: string;
  url: string;
  snippet: string;
  engine: SearchEngine;
  postedAt?: string;
}

const CANDIDATE_SCHEMA =
  'Return ONLY a JSON array (no prose, no fences) of up to %N objects: {"title","url","snippet","postedAt"}. ' +
  'snippet = a SHORT public quote or description (max ~30 words) that shows why it matches. ' +
  'url = a real public page you actually saw in search results. Never invent URLs, dates or deadlines — ' +
  'leave postedAt as "" if unknown. Skip anything behind a login, paywall or private app.';

function searchPrompt(plan: ContextPlan, focus: string, max: number) {
  return [
    `You are KeyP's ${focus} search lane. Find PUBLIC signals that satisfy this structured intent.`,
    "",
    `Intent: ${plan.normalizedIntent}`,
    `Goal: ${plan.userGoal}`,
    `Must have: ${plan.mustHave.join(" | ") || "-"}`,
    `Should have: ${plan.shouldHave.join(" | ") || "-"}`,
    `Must NOT have (hard exclusions): ${plan.mustNotHave.join(" | ") || "-"}`,
    `Places: ${plan.geography.places.join(", ") || "-"}`,
    `Time window: ${plan.timeWindow.start ?? "-"} → ${plan.timeWindow.end ?? "-"} (urgency ${plan.timeWindow.urgency}, recency ${plan.recencyHours}h)`,
    `Evidence requirements: ${plan.evidenceRequirements.join(" | ") || "-"}`,
    `Suggested queries: ${plan.generatedQueries.join(" | ") || plan.normalizedIntent}`,
    "",
    "SAFETY: public sources only. No private/login-walled/dating-app data, no minors, no inferring",
    "personal attributes from photos or names. Person-related hits must show the person's own public",
    "statement (including that they are 18+ when age matters).",
    "",
    CANDIDATE_SCHEMA.replace("%N", String(max)),
  ].join("\n");
}

/* ─────────── lanes ─────────── */

async function grokSearch(plan: ContextPlan, max: number): Promise<RawCandidate[]> {
  const key = process.env["XAI_API_KEY"];
  if (!key) throw new Error("XAI_API_KEY is not configured");
  const model = process.env["GROK_MODEL"] || "grok-4.6";
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: searchPrompt(plan, "X/realtime social + web", max),
      tools: [{ type: "web_search" }, { type: "x_search" }],
      max_tool_calls: 6,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as Record<string, any>;
  // xAI Responses: the answer lives in output[] message items as `output_text` parts.
  let out = typeof data["output_text"] === "string" ? data["output_text"] : "";
  const citations: string[] = [];
  for (const item of (data["output"] ?? []) as Array<Record<string, any>>) {
    if (item?.["type"] === "message") {
      for (const part of item["content"] ?? []) {
        if (part?.["type"] === "output_text" && typeof part["text"] === "string") out += part["text"];
      }
    }
    const walkUrls = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walkUrls);
      if (typeof n["url"] === "string") citations.push(n["url"]);
      for (const v of Object.values(n)) walkUrls(v);
    };
    if (item?.["type"] !== "message") walkUrls(item);
  }
  const items = extractJson<Array<Record<string, any>>>(out) ?? [];
  const mapped: RawCandidate[] = items
    .filter((i) => typeof i?.["url"] === "string")
    .map((i) => ({
      engine: "grok" as SearchEngine,
      title: String(i["title"] ?? "").slice(0, 300),
      url: String(i["url"]),
      snippet: String(i["snippet"] ?? "").slice(0, 400),
      postedAt: typeof i["postedAt"] === "string" ? i["postedAt"] : "",
    }));
  // keep a few raw citations as extra candidates when the model returned too few
  for (const u of citations.slice(0, max)) {
    if (mapped.length >= max) break;
    if (!mapped.some((m) => m.url === u)) {
      mapped.push({ engine: "grok", title: hostOf(u) || u, url: u, snippet: "" });
    }
  }
  return mapped.slice(0, max);
}

async function geminiSearch(plan: ContextPlan, max: number): Promise<RawCandidate[]> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: searchPrompt(plan, "official web / news (Google Search)", max) }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as Record<string, any>;
  const cand = (data["candidates"] ?? [])[0] ?? {};
  let text = "";
  for (const p of cand?.content?.parts ?? []) if (typeof p?.text === "string") text += p.text;
  const items = extractJson<Array<Record<string, any>>>(text) ?? [];
  return items
    .filter((i) => typeof i?.["url"] === "string")
    .slice(0, max)
    .map((i) => ({
      engine: "gemini" as SearchEngine,
      title: String(i["title"] ?? "").slice(0, 300),
      url: String(i["url"]),
      snippet: String(i["snippet"] ?? "").slice(0, 400),
      postedAt: typeof i["postedAt"] === "string" ? i["postedAt"] : "",
    }));
}

/** Knowledge-only lane used when Gemini is absent. NOT live search — labeled as such. */
async function lovableSearch(plan: ContextPlan, max: number): Promise<RawCandidate[]> {
  const text = await callLovable(
    [
      searchPrompt(plan, "knowledge-based web", max),
      "",
      "You have NO web access in this call. Only list pages you are confident exist, with their",
      'official URL. If you are unsure, return an empty array [] rather than guessing.',
    ].join("\n"),
  );
  const items = extractJson<Array<Record<string, any>>>(text) ?? [];
  return items
    .filter((i) => typeof i?.["url"] === "string")
    .slice(0, max)
    .map((i) => ({
      engine: "lovable" as SearchEngine,
      title: String(i["title"] ?? "").slice(0, 300),
      url: String(i["url"]),
      snippet: String(i["snippet"] ?? "").slice(0, 400),
    }));
}

/* ─────────── direct URL verification ─────────── */

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function verifyUrl(c: RawCandidate): Promise<ContextEvidence> {
  const base: ContextEvidence = {
    engine: c.engine,
    url: c.url,
    title: c.title || hostOf(c.url),
    statusCode: null,
    snippet: c.snippet,
    accessible: false,
    isX: isX(c.url),
  };
  const blocked = blockedFor(c.url);
  if (blocked) return { ...base, blockedReason: blocked.reason };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetch(c.url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const type = res.headers.get("content-type") || "";
    let snippet = c.snippet;
    if (res.ok && type.includes("text")) {
      const html = (await res.text()).slice(0, 60_000);
      snippet = (c.snippet ? `${c.snippet} — ` : "") + stripHtml(html).slice(0, 600);
    }
    // 4xx/5xx or non-text: mark for manual check, never bypass a wall
    return { ...base, statusCode: res.status, accessible: res.ok, snippet: snippet.slice(0, 900) };
  } catch (e) {
    return { ...base, blockedReason: `직접 확인 실패 — ${(e as Error).name}: 확인 필요` };
  }
}

/* ─────────── on-demand Daytona deep fetch ─────────── */

function needsDeepFetch(plan: ContextPlan, evidence: ContextEvidence[]) {
  const hay = [...plan.evidenceRequirements, ...plan.sourceStrategy.flatMap((s) => s.queryHints)]
    .join(" ")
    .toLowerCase();
  const wants = /(pdf|첨부|공고문|attachment|download|파일|여러 페이지|multi-page|javascript|렌더)/.test(hay);
  const thin = evidence.filter((e) => e.accessible).length === 0 && evidence.length > 0;
  return wants || thin;
}

async function daytonaDeepFetch(urls: string[], logs: string[]): Promise<ContextEvidence[]> {
  const { createSandbox, destroySandbox, exec, writeFile, isDaytonaConfigured } = await import(
    "@/lib/daytona/client.server"
  );
  if (!isDaytonaConfigured()) {
    logs.push("[daytona] skipped — DAYTONA_API_KEY not configured");
    return [];
  }
  let sandbox: Awaited<ReturnType<typeof createSandbox>> | null = null;
  try {
    logs.push(`[daytona] on-demand sandbox for deep fetch of ${urls.length} url(s)`);
    sandbox = await createSandbox({ labels: { purpose: "context-watch" } });
    const dir = "/home/daytona/keyp/context";
    await exec(sandbox, `mkdir -p ${dir}`);
    await writeFile(sandbox, `${dir}/urls.json`, JSON.stringify({ urls }));
    await writeFile(sandbox, `${dir}/deep_fetch.py`, DEEP_FETCH_PY);
    const run = await exec(sandbox, `cd ${dir} && python3 deep_fetch.py`, { timeout: 240 });
    const m = run.result.match(/KEYP_DEEP_JSON:(\[[\s\S]*\])/);
    if (!m) {
      logs.push("[daytona] deep fetch produced no structured output");
      return [];
    }
    const arr = JSON.parse(m[1]) as Array<Record<string, any>>;
    logs.push(`[daytona] deep fetch returned ${arr.length} verified source(s); sandbox destroyed`);
    return arr.map((r) => ({
      engine: "daytona" as SearchEngine,
      url: String(r["url"] ?? ""),
      title: String(r["title"] ?? ""),
      statusCode: typeof r["status"] === "number" ? r["status"] : null,
      snippet: String(r["snippet"] ?? "").slice(0, 900),
      accessible: Boolean(r["ok"]),
      isX: isX(String(r["url"] ?? "")),
    }));
  } catch (e) {
    logs.push(`[daytona] deep fetch failed — ${(e as Error).message.slice(0, 200)}`);
    return [];
  } finally {
    if (sandbox) await destroySandbox(sandbox);
  }
}

const DEEP_FETCH_PY = String.raw`
import json, os, re, urllib.request
UA = "Mozilla/5.0 (compatible; KeyPContextWatch/1.0)"
urls = json.load(open("urls.json"))["urls"]
out = []
def strip(h):
    h = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", h, flags=re.I)
    h = re.sub(r"<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", h).strip()
for u in urls[:5]:
    rec = {"url": u, "ok": False, "status": None, "title": "", "snippet": ""}
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            rec["status"] = r.status
            raw = r.read(400000)
            ct = r.headers.get("Content-Type", "")
            if "pdf" in ct.lower() or u.lower().endswith(".pdf"):
                txt = " ".join(re.findall(rb"[ -~\n]{6,}", raw)[:400].__str__().split())[:1200]
                rec["snippet"] = txt
            else:
                body = raw.decode("utf-8", "replace")
                m = re.search(r"<title[^>]*>([\s\S]*?)</title>", body, re.I)
                rec["title"] = (m.group(1).strip()[:200] if m else "")
                rec["snippet"] = strip(body)[:900]
            rec["ok"] = 200 <= (rec["status"] or 0) < 400
    except Exception as e:
        rec["snippet"] = "fetch failed: %s" % str(e)[:120]
    out.append(rec)
print("KEYP_DEEP_JSON:" + json.dumps(out, ensure_ascii=False))
`;

/* ─────────── orchestration ─────────── */

export interface RoutedSources {
  candidates: Array<{
    key: string;
    title: string;
    url: string;
    sourceType: "official" | "web" | "x" | "community";
    discoveredBy: SearchEngine[];
    evidence: ContextEvidence[];
    postedAt?: string;
  }>;
  enginesUsed: SearchEngine[];
  engineErrors: Array<{ engine: SearchEngine; message: string }>;
  blockedSources: Array<{ host: string; reason: string }>;
  logs: string[];
  usedDaytona: boolean;
}

export async function routeSources(plan: ContextPlan, maxResults = 8): Promise<RoutedSources> {
  const logs: string[] = [];
  const enginesUsed: SearchEngine[] = [];
  const engineErrors: RoutedSources["engineErrors"] = [];
  const blockedSources: RoutedSources["blockedSources"] = [];
  const perLane = Math.max(maxResults, 6);

  const wantsSocial = plan.sourceStrategy.some((s) => /x|twitter|social|sns|realtime|커뮤니티|reddit/i.test(s.source));
  logs.push(
    `[router] strategy: ${plan.sourceStrategy.map((s) => `${s.priority}. ${s.source}`).join(" · ") || "(none)"}`,
  );

  const lanes: Array<Promise<RawCandidate[]>> = [];
  const laneNames: SearchEngine[] = [];
  if (process.env["XAI_API_KEY"]) {
    logs.push(`[router] grok lane (x_search + web_search)${wantsSocial ? " — plan prioritises social signals" : ""}`);
    lanes.push(grokSearch(plan, perLane));
    laneNames.push("grok");
  } else {
    logs.push("[router] grok lane skipped — XAI_API_KEY not configured (no fake X results)");
  }
  if (process.env["GEMINI_API_KEY"]) {
    logs.push("[router] gemini lane (Google Search grounding)");
    lanes.push(geminiSearch(plan, perLane));
    laneNames.push("gemini");
  } else if (process.env["LOVABLE_API_KEY"]) {
    logs.push("[router] gemini absent → Lovable AI knowledge lane (model knowledge, NOT live search)");
    lanes.push(lovableSearch(plan, perLane));
    laneNames.push("lovable");
  } else {
    logs.push("[router] web lane skipped — no GEMINI_API_KEY and no Lovable AI");
  }

  const settled = await Promise.allSettled(lanes);
  const raw: RawCandidate[] = [];
  settled.forEach((r, i) => {
    const engine = laneNames[i]!;
    if (r.status === "fulfilled") {
      enginesUsed.push(engine);
      raw.push(...r.value);
      logs.push(`[router] ${engine}: ${r.value.length} candidate(s)`);
    } else {
      engineErrors.push({ engine, message: String(r.reason?.message ?? r.reason).slice(0, 300) });
      logs.push(`[router] ${engine} failed — other lanes kept`);
    }
  });

  // dedupe by host + normalized title
  const byKey = new Map<string, RoutedSources["candidates"][number]>();
  for (const c of raw) {
    if (!/^https?:\/\//i.test(c.url)) continue;
    const blocked = blockedFor(c.url);
    if (blocked) {
      if (!blockedSources.some((b) => b.host === blocked.host)) blockedSources.push(blocked);
      logs.push(`[router] ${blocked.host} → 접근하지 않음 (${blocked.reason})`);
      continue;
    }
    const key = `${hostOf(c.url)}|${(c.title || c.url).toLowerCase().slice(0, 60)}`;
    const exist = byKey.get(key);
    if (exist) {
      if (!exist.discoveredBy.includes(c.engine)) exist.discoveredBy.push(c.engine);
      continue;
    }
    byKey.set(key, {
      key,
      title: c.title || hostOf(c.url),
      url: c.url,
      sourceType: sourceTypeOf(c.url),
      discoveredBy: [c.engine],
      evidence: [],
      postedAt: c.postedAt,
    });
  }

  const candidates = [...byKey.values()].slice(0, 12);
  logs.push(`[router] ${candidates.length} unique candidate(s) after dedupe → direct HTTP verification`);
  const verified = await Promise.all(
    candidates.map((c) =>
      verifyUrl({ engine: c.discoveredBy[0]!, title: c.title, url: c.url, snippet: raw.find((r) => r.url === c.url)?.snippet ?? "" }),
    ),
  );
  candidates.forEach((c, i) => c.evidence.push(verified[i]!));
  logs.push(`[router] verified: ${verified.filter((v) => v.accessible).length}/${verified.length} accessible`);
  for (const c of candidates) logs.push(`[router] candidate ${c.sourceType} ${c.url} — ${c.title.slice(0, 70)}`);

  // Daytona only when the plan needs deep work or nothing was readable directly
  let usedDaytona = false;
  if (needsDeepFetch(plan, verified)) {
    const targets = candidates.filter((c) => !c.evidence[0]!.accessible).slice(0, 3).map((c) => c.url);
    if (targets.length) {
      const deep = await daytonaDeepFetch(targets, logs);
      usedDaytona = deep.length > 0;
      for (const d of deep) {
        const c = candidates.find((x) => x.url === d.url);
        if (c) c.evidence.push(d);
      }
      if (usedDaytona) enginesUsed.push("daytona");
    }
  } else {
    logs.push("[router] Daytona skipped — direct verification produced enough evidence (cost saved)");
  }

  return { candidates, enginesUsed, engineErrors, blockedSources, logs, usedDaytona };
}
