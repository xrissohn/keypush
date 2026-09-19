// Server-only: Context Watch orchestration + Supabase persistence.
// Browser never writes to the DB directly (no auth yet) — every read/write goes
// through this module from a server route.
// TODO(auth): once sign-in exists, set owner_id from the session and add
// owner-scoped RLS policies so clients can read their own watches directly.

import { buildContextPlan, judgeCandidates } from "./reasoner.server";
import { routeSources } from "./source-router.server";
import { createHash } from "node:crypto";
import type {
  ContextFinding,
  ContextPlan,
  ContextWatch,
  SearchEngine,
  WatchErrorResult,
  WatchRunResult,
  WatchNotification,
} from "./types";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function rowToWatch(r: Record<string, any>): ContextWatch {
  return {
    id: r["id"],
    rawQuery: r["raw_query"],
    intentSummary: r["intent_summary"] ?? "",
    plan: (r["plan"] ?? {}) as ContextPlan,
    planEngine: r["plan_engine"] ?? "unknown",
    active: Boolean(r["active"]),
    refreshMinutes: r["refresh_minutes"] ?? 60,
    nextRunAt: r["next_run_at"],
    lastRunAt: r["last_run_at"],
    lastStatus: r["last_status"],
    createdAt: r["created_at"],
    baselineAt: r["baseline_at"] ?? r["created_at"],
    baselineCompletedAt: r["baseline_completed_at"],
  };
}

function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function normalizeContent(value: string) {
  return value.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceIdOf(value: string) {
  try {
    const url = new URL(value);
    const xId = url.pathname.match(/\/status\/(\d+)/)?.[1];
    const videoId = url.hostname.includes("youtu") ? url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1) : null;
    return xId ?? videoId ?? url.pathname.replace(/\/$/, "");
  } catch {
    return value;
  }
}

export async function listWatches(): Promise<ContextWatch[]> {
  const sb = await db();
  const { data, error } = await sb
    .from("context_watches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToWatch);
}

export async function listFindings(watchId: string): Promise<ContextFinding[]> {
  const sb = await db();
  const { data, error } = await sb
    .from("findings")
    .select("*")
    .eq("watch_id", watchId)
    .order("first_seen_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r["id"],
    dedupeKey: r["dedupe_key"],
    title: r["title"],
    summary: r["summary"],
    whyMatched: r["why_matched"],
    sourceUrl: r["source_url"],
    sourceType: r["source_type"],
    discoveredBy: (r["discovered_by"] ?? []) as SearchEngine[],
    matchScore: r["match_score"],
    confidence: r["confidence"],
    verified: r["verified"],
    matchedConstraints: r["matched_constraints"] ?? [],
    missingConstraints: r["missing_constraints"] ?? [],
    contradiction: r["contradictions"] ?? [],
    evidence: r["evidence"] ?? [],
    firstSeenAt: r["first_seen_at"],
    lastSeenAt: r["last_seen_at"],
    publishedAt: r["published_at"],
    canonicalUrl: r["canonical_url"] ?? r["source_url"],
    contentHash: r["content_hash"],
    semanticFingerprint: r["semantic_fingerprint"],
    isBaseline: Boolean(r["is_baseline"]),
  }));
}

/** Create a watch: natural language → OpenAI ContextPlan → DB row. */
export async function createWatch(rawQuery: string): Promise<
  | { ok: true; watch: ContextWatch; baselineFinding: ContextFinding | null; baselineKind: "strong" | "closest" | "none" }
  | WatchErrorResult
> {
  const planned = await buildContextPlan(rawQuery).catch((e) => e as Error);
  if (planned instanceof Error) {
    return {
      ok: false,
      code: "not_configured",
      error: `의도 해석에 실패했습니다 — OpenAI와 Lovable AI 모두 사용할 수 없습니다. (${planned.message.slice(0, 200)})`,
    };
  }
  const sb = await db();
  const { data, error } = await sb
    .from("context_watches")
    .insert({
      raw_query: rawQuery,
      intent_summary: planned.plan.normalizedIntent,
      plan: JSON.parse(JSON.stringify(planned.plan)),
      plan_engine: planned.engine,
      refresh_minutes: planned.plan.refreshMinutes,
      next_run_at: new Date().toISOString(),
      baseline_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, code: "engine_error", error: error?.message ?? "insert failed" };
  const initial = await runWatch(data["id"], "baseline");
  if (!initial.ok) return initial;
  const baselineFinding = initial.findings[0] ?? initial.nearMisses[0] ?? null;
  return { ok: true, watch: { ...rowToWatch(data), baselineCompletedAt: new Date().toISOString() }, baselineFinding, baselineKind: initial.findings[0] ? "strong" : baselineFinding ? "closest" : "none" };
}

/** Run one watch now: sources → evidence → judge → persist findings + notifications. */
export async function runWatch(
  watchId: string,
  trigger: "baseline" | "manual" | "scheduler" = "manual",
): Promise<WatchRunResult | WatchErrorResult> {
  const sb = await db();
  const t0 = Date.now();
  const { data: wrow, error: werr } = await sb.from("context_watches").select("*").eq("id", watchId).maybeSingle();
  if (werr) return { ok: false, code: "engine_error", error: werr.message };
  if (!wrow) return { ok: false, code: "not_found", error: "watch not found" };
  const watch = rowToWatch(wrow);
  const plan = watch.plan;

  const logs: string[] = [];
  const { data: runRow } = await sb
    .from("watch_runs")
    .insert({ watch_id: watchId, status: "running", trigger })
    .select("id")
    .single();
  const runId = runRow?.["id"] as string | undefined;

  try {
    const routed = await routeSources(plan, 8);
    logs.push(...routed.logs);

    const judged = await judgeCandidates(
      plan,
      routed.candidates.map((c) => ({
        key: c.key,
        title: c.title,
        url: c.url,
        sourceType: c.sourceType,
        snippet: c.evidence[0]?.snippet ?? "",
        evidence: c.evidence,
      })),
    );
    logs.push(...judged.logs);

    // keep the plan's threshold but bound it so a very strict plan still surfaces strong hits
    const threshold = Math.min(Math.max(plan.matchThreshold, 40), 70);
    logs.push(
      `[judge] scores: ${Object.values(judged.judgements)
        .map((j) => j.matchScore)
        .sort((a, b) => b - a)
        .join(", ")}`,
    );
    const findings: ContextFinding[] = [];
    const nearMisses: ContextFinding[] = [];
    let belowThreshold = 0;
    for (const c of routed.candidates) {
      const j = judged.judgements[c.key];
      if (!j) continue;
      const canonicalUrl = canonicalizeUrl(c.url);
      const content = normalizeContent(`${c.title} ${j.summary} ${c.evidence.map((e) => e.snippet).join(" ")}`);
      const contentHash = digest(content);
      const semanticFingerprint = digest(normalizeContent(`${c.title} ${j.summary}`));
      const dedupeKey = digest(`${canonicalUrl}|${sourceIdOf(canonicalUrl)}|${contentHash}`);
      const publishedAt = c.postedAt && !Number.isNaN(Date.parse(c.postedAt)) ? new Date(c.postedAt).toISOString() : null;
      const item: ContextFinding = {
        dedupeKey,
        title: c.title,
        summary: j.summary,
        whyMatched: j.whyMatched,
        sourceUrl: c.url,
        sourceType: c.sourceType,
        discoveredBy: c.discoveredBy,
        verified: c.evidence.some((e) => e.accessible),
        evidence: c.evidence,
        matchScore: j.matchScore,
        matchedConstraints: j.matchedConstraints,
        missingConstraints: j.missingConstraints,
        contradiction: j.contradiction,
        confidence: j.confidence,
        publishedAt,
        canonicalUrl,
        contentHash,
        semanticFingerprint,
        isBaseline: trigger === "baseline",
      };
      if (j.matchScore < threshold) {
        belowThreshold += 1;
        nearMisses.push(item);
        continue;
      }
      findings.push(item);
    }
    findings.sort((a, b) => b.matchScore - a.matchScore);
    nearMisses.sort((a, b) => b.matchScore - a.matchScore);
    nearMisses.splice(trigger === "baseline" ? 1 : 5);
    if (trigger === "baseline") findings.splice(1);
    logs.push(
      `[judge] ${findings.length} above threshold ${threshold}, ${belowThreshold} filtered out (not notified)`,
    );

    // Baseline stores exactly one best verified reference (including the closest near miss).
    // Later runs persist and return only truly new findings.
    const persistable = trigger === "baseline" ? (findings.length ? findings : nearMisses.slice(0, 1)) : findings;
    const newFindings: ContextFinding[] = [];
    for (const f of persistable) {
      const { data: existing } = await sb
        .from("findings")
        .select("id, content_hash, semantic_fingerprint")
        .eq("watch_id", watchId)
        .or(`dedupe_key.eq.${f.dedupeKey},content_hash.eq.${f.contentHash},semantic_fingerprint.eq.${f.semanticFingerprint}`)
        .limit(1)
        .maybeSingle();
      const isAfterBaseline = f.publishedAt
        ? new Date(f.publishedAt).getTime() >= new Date(watch.baselineAt).getTime()
        : !existing && Date.now() > new Date(watch.baselineAt).getTime();
      if (trigger !== "baseline" && !isAfterBaseline) continue;
      const payload = {
        watch_id: watchId,
        run_id: runId ?? null,
        dedupe_key: f.dedupeKey,
        title: f.title,
        summary: f.summary,
        why_matched: f.whyMatched,
        source_url: f.sourceUrl,
        source_type: f.sourceType,
        discovered_by: f.discoveredBy,
        match_score: f.matchScore,
        confidence: f.confidence,
        verified: f.verified,
        matched_constraints: f.matchedConstraints,
        missing_constraints: f.missingConstraints,
        contradictions: f.contradiction,
        evidence: JSON.parse(JSON.stringify(f.evidence)),
        is_baseline: trigger === "baseline",
        published_at: f.publishedAt ?? null,
        canonical_url: f.canonicalUrl,
        content_hash: f.contentHash,
        semantic_fingerprint: f.semanticFingerprint,
        last_seen_at: new Date().toISOString(),
      };
      if (existing?.["id"]) {
        f.id = existing["id"] as string;
        f.isNew = false;
        await sb.from("findings").update(payload).eq("id", f.id);
      } else {
        const { data: ins } = await sb.from("findings").insert(payload).select("id").single();
        f.id = ins?.["id"] as string | undefined;
        f.isNew = true;
        newFindings.push(f);
        const findingId = f.id;
        if (findingId) {
          await sb.from("source_evidence").insert(
            f.evidence.map((e) => ({
              finding_id: findingId,
              engine: e.engine,
              url: e.url,
              title: e.title,
              status_code: e.statusCode,
              snippet: e.snippet.slice(0, 900),
              accessible: e.accessible,
              is_x: e.isX,
            })),
          );
          if (trigger !== "baseline") await sb
            .from("notification_queue")
            .insert({
              watch_id: watchId,
              finding_id: findingId,
              payload: { title: f.title, url: f.sourceUrl, matchScore: f.matchScore },
            })
            .select("id");
        }
      }
    }

    const enginesUsed = [...new Set(routed.enginesUsed)];
    if (runId) {
      await sb
        .from("watch_runs")
        .update({
          status: "success",
          engines_used: enginesUsed,
          step_logs: logs,
           findings_count: trigger === "baseline" ? persistable.length : newFindings.length,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    await sb
      .from("context_watches")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: "success",
        next_run_at: new Date(Date.now() + Math.max(plan.refreshMinutes, 15) * 60_000).toISOString(),
        ...(trigger === "baseline" ? { baseline_completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", watchId);

    return {
      ok: true,
      watchId,
      runId: runId ?? "",
      plan,
      planEngine: (watch.planEngine as WatchRunResult["planEngine"]) ?? "lovable",
      reasonerFallback: watch.planEngine === "lovable",
      enginesUsed,
      engineErrors: routed.engineErrors,
      blockedSources: routed.blockedSources,
       findings: trigger === "baseline" ? findings : newFindings,
      nearMisses,
      belowThreshold,
      logs,
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    const message = (e as Error).message.slice(0, 400);
    if (runId) {
      await sb
        .from("watch_runs")
        .update({ status: "error", error: message, step_logs: logs, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    await sb.from("context_watches").update({ last_status: `error: ${message.slice(0, 120)}` }).eq("id", watchId);
    return { ok: false, code: "engine_error", error: message, logs };
  }
}

export async function updateWatch(watchId: string, input: { active?: boolean; refreshMinutes?: number }) {
  const sb = await db();
  const refreshMinutes = typeof input.refreshMinutes === "number"
    ? Math.min(Math.max(Math.round(input.refreshMinutes), 15), 10080)
    : undefined;
  const patch = {
    ...(typeof input.active === "boolean" ? { active: input.active } : {}),
    ...(refreshMinutes === undefined ? {} : {
      refresh_minutes: refreshMinutes,
      next_run_at: new Date(Date.now() + refreshMinutes * 60_000).toISOString(),
    }),
  };
  const { data, error } = await sb.from("context_watches").update(patch).eq("id", watchId).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "watch update failed");
  return rowToWatch(data);
}

export async function deleteWatch(watchId: string) {
  const sb = await db();
  const { error } = await sb.from("context_watches").delete().eq("id", watchId);
  if (error) throw new Error(error.message);
}

export async function listNotifications(): Promise<WatchNotification[]> {
  const sb = await db();
  await sb
    .from("notification_queue")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("status", "queued");
  const { data, error } = await sb.from("notification_queue").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      watchId: row.watch_id,
      findingId: row.finding_id,
      status: row.status as WatchNotification["status"],
      title: String(payload["title"] ?? "새 정보를 찾았어요"),
      url: String(payload["url"] ?? ""),
      matchScore: Number(payload["matchScore"] ?? 0),
      createdAt: row.created_at,
    };
  });
}

export async function markNotificationsRead(ids?: string[]) {
  const sb = await db();
  let query = sb.from("notification_queue").update({ status: "read", read_at: new Date().toISOString() }).neq("status", "read");
  if (ids?.length) query = query.in("id", ids);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** Idempotent scheduler tick: claim_due_watches() locks rows so ticks can't overlap. */
export async function tickScheduler(limit = 3) {
  const sb = await db();
  const { data, error } = await sb.rpc("claim_due_watches", { p_limit: limit });
  if (error) throw new Error(error.message);
  const claimed = (data ?? []) as Array<Record<string, any>>;
  const results: Array<{ watchId: string; ok: boolean; findings?: number; error?: string }> = [];
  for (const row of claimed) {
    const r = await runWatch(row["id"], "scheduler");
    results.push(
      r.ok ? { watchId: row["id"], ok: true, findings: r.findings.length } : { watchId: row["id"], ok: false, error: r.error },
    );
  }
  return { claimed: claimed.length, results };
}
