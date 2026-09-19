// Server-only: runs the multi-source research workload INSIDE a Daytona sandbox.
import {
  createSandbox,
  destroySandbox,
  exec,
  isDaytonaConfigured,
  writeFile,
  type DaytonaSandbox,
} from "@/lib/daytona/client.server";
import { SAMPLE_COMPANY_PROFILE, type CompanyProfile } from "@/lib/daytona/types";
import { RESEARCH_AGENT_PY } from "./research-agent.py";
import type { EngineError, ResearchEngine, ResearchResponse, ResearchResultItem } from "./types";

const RESEARCH_DIR = "/home/daytona/keyp/research";

export function getResearchConfig() {
  return {
    daytonaConfigured: isDaytonaConfigured(),
    geminiKey: process.env["GEMINI_API_KEY"] || "",
    grokKey: process.env["XAI_API_KEY"] || "",
    lovableAiAvailable: Boolean(process.env["LOVABLE_API_KEY"]),
    geminiModel: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
    grokModel: process.env["GROK_MODEL"] || "grok-4.6",
  };
}

/** single-quote a value for safe use inside a POSIX shell command */
function sq(v: string) {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/**
 * Gemini-lane fallback via Lovable AI (server-side: the sandbox network cannot
 * reach the gateway). Knowledge-only — no live web search — so every candidate
 * still goes through direct URL verification inside the sandbox.
 */
async function fetchLovableCandidates(
  query: string,
  profile: CompanyProfile,
  maxResults: number,
): Promise<Array<Record<string, unknown>>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return [];
  const prompt = [
    "You are the research engine for KeyP. From your own knowledge, list funding, grant,",
    "competition, accelerator and hackathon opportunities matching this request.",
    "You have NO web access in this call — only list programs you are confident exist,",
    "with their official homepage URL. If unsure of a deadline, set deadline to \"\" — never invent one.",
    "",
    `Request: ${query}`,
    `Company profile: ${JSON.stringify(profile)}`,
    "",
    `Return ONLY a JSON array (no prose, no markdown fences) of up to ${maxResults} objects with keys:`,
    '"title","category","deadline","organizer","location","summary","why","url".',
  ].join("\n");

  // stream: reasoning calls can run long; bytes must flow to survive timeouts
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "low",
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Lovable AI gateway returned HTTP ${res.status}`);
  }
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
        /* partial chunk */
      }
    }
  }
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s === -1 || e <= s) return [];
  try {
    const arr = JSON.parse(text.slice(s, e + 1));
    return Array.isArray(arr) ? arr.slice(0, maxResults * 2) : [];
  } catch {
    return [];
  }
}

export async function runResearchInSandbox(input: {
  query: string;
  companyProfile?: CompanyProfile;
  maxResults?: number;
}): Promise<ResearchResponse> {
  const cfg = getResearchConfig();
  if (!cfg.daytonaConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "DAYTONA_API_KEY is not configured on the server. Live research runs inside a Daytona sandbox, so no live search was performed. Add the secret in Project Settings → Secrets.",
    };
  }

  const profile = input.companyProfile ?? SAMPLE_COMPANY_PROFILE;
  const maxResults = Math.min(Math.max(input.maxResults ?? 8, 1), 8);
  const logs: string[] = [];
  const push = (l: string) => logs.push(`[${new Date().toISOString().slice(11, 19)}] ${l}`);
  const t0 = Date.now();
  let sandbox: DaytonaSandbox | null = null;

  try {
    push("daytona: creating isolated research sandbox…");
    sandbox = await createSandbox({ labels: { purpose: "research" } });
    push(`daytona: sandbox ready id=${sandbox.id}`);

    await exec(sandbox, `mkdir -p ${RESEARCH_DIR}`);
    // user text travels as a JSON file, never as a shell argument
    await writeFile(
      sandbox,
      `${RESEARCH_DIR}/input.json`,
      JSON.stringify(
        {
          query: input.query,
          companyProfile: profile,
          maxResults,
          maxFetch: 12,
          geminiModel: cfg.geminiModel,
          grokModel: cfg.grokModel,
        },
        null,
        2,
      ),
    );
    await writeFile(sandbox, `${RESEARCH_DIR}/research_agent.py`, RESEARCH_AGENT_PY);
    push("fs: wrote input.json + research_agent.py");

    // Lovable AI fallback for the Gemini lane. The sandbox network cannot reach
    // the AI gateway, so the call happens server-side and parsed candidates are
    // handed to the sandbox as a JSON file for verification + fusion.
    if (!cfg.geminiKey && cfg.lovableAiAvailable) {
      push("lovable: requesting knowledge-based candidates from Lovable AI (server-side)…");
      try {
        const items = await fetchLovableCandidates(input.query, profile, maxResults);
        await writeFile(sandbox, `${RESEARCH_DIR}/lovable-candidates.json`, JSON.stringify({ items }));
        push(`lovable: ${items.length} candidates written to sandbox (model knowledge, not live search)`);
      } catch (e) {
        push(`lovable: fallback failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const envPrefix = [
      cfg.geminiKey ? `GEMINI_API_KEY=${sq(cfg.geminiKey)}` : "",
      cfg.grokKey ? `XAI_API_KEY=${sq(cfg.grokKey)}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    push(
      `exec: python3 research_agent.py (engines: ${
        [
          cfg.geminiKey ? "gemini" : cfg.lovableAiAvailable ? "lovable(fallback)" : "",
          cfg.grokKey && "grok",
        ]
          .filter(Boolean)
          .join(" + ") || "none configured"
      })`,
    );
    const run = await exec(sandbox, `cd ${RESEARCH_DIR} && ${envPrefix} python3 research_agent.py`, {
      timeout: 700, // grok (240s + one retry) + gemini + direct URL fetches
    });
    if (run.exitCode !== 0) {
      throw new Error(`research agent exited with code ${run.exitCode}: ${run.result.slice(-500)}`);
    }
    const m = run.result.match(/KEYP_RESEARCH_JSON:(\{[\s\S]*\})/);
    if (!m) throw new Error("research agent produced no structured result");
    const parsed = JSON.parse(m[1]) as {
      enginesUsed: ResearchEngine[];
      engineErrors: EngineError[];
      results: ResearchResultItem[];
      logs: string[];
    };
    logs.push(...parsed.logs);
    push(`merge: ${parsed.results.length} ranked opportunities returned`);

    const noLive = parsed.enginesUsed.length === 0;
    const lovableOnly = parsed.enginesUsed.includes("lovable") && !parsed.enginesUsed.includes("gemini");
    return {
      ok: true,
      sandboxId: sandbox.id,
      query: input.query,
      enginesUsed: parsed.enginesUsed,
      engineErrors: parsed.engineErrors,
      noLiveSearchEngine: noLive,
      liveSearchNote: noLive
        ? "No live search engine configured — no live Gemini Google Search or Grok X Search was performed. Add GEMINI_API_KEY and/or XAI_API_KEY to enable live research."
        : cfg.geminiKey
          ? undefined
          : lovableOnly || parsed.enginesUsed.includes("lovable")
            ? "Gemini direct grounding unavailable (GEMINI_API_KEY missing) — Lovable AI knowledge fallback was used for the Gemini lane; its candidates are model knowledge, not live search results, and were verified by direct URL fetch."
            : "Direct Gemini Google Search grounding unavailable (GEMINI_API_KEY missing).",
      results: parsed.results,
      logs,
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    push(`error: ${message}`);
    console.error("[research] run failed", message);
    return { ok: false, code: "daytona_error", error: message, logs };
  } finally {
    if (sandbox) await destroySandbox(sandbox);
  }
}
