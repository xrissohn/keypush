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

    const envPrefix = [
      cfg.geminiKey ? `GEMINI_API_KEY=${sq(cfg.geminiKey)}` : "",
      cfg.grokKey ? `XAI_API_KEY=${sq(cfg.grokKey)}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    push(
      `exec: python3 research_agent.py (engines: ${
        [cfg.geminiKey && "gemini", cfg.grokKey && "grok"].filter(Boolean).join(" + ") || "none configured"
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
