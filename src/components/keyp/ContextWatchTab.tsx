import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  CONTEXT_STEPS,
  type ContextFinding,
  type ContextPlan,
  type ContextWatch,
  type WatchRunResult,
} from "@/lib/context/types";
import type { ResearchEngineStatus } from "@/lib/research/types";

const EXAMPLES = [
  "다음주 뉴욕에 가는데 공개적으로 한국 남성과 데이트하고 싶다고 밝힌 18세 이상 현지 여성이 있으면 알려줘",
  "서울에서 7일 안에 마감하는 AI 스타트업 지원사업 중 우리 회사가 지원할 수 있는 걸 알려줘",
];

type WatchWithFindings = ContextWatch & { findings: ContextFinding[] };

export function ContextWatchTab({ engines }: { engines: ResearchEngineStatus | undefined }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [lastRun, setLastRun] = useState<WatchRunResult | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watches = useQuery({
    queryKey: ["watches"],
    queryFn: async () => {
      const res = await fetch("/api/watches");
      const json = (await res.json()) as { ok: boolean; watches?: WatchWithFindings[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "목록을 불러올 수 없습니다");
      return json.watches ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (query: string) => {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = (await res.json()) as
        | { ok: true; watch: ContextWatch; planEngine: string; reasonerFallback: boolean }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: async (r) => {
      setDraft("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["watches"] });
      void runWatch(r.watch.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  async function runWatch(id: string) {
    setRunningId(id);
    setError(null);
    setLastRun(null);
    try {
      const res = await fetch(`/api/watches/${id}/run`, { method: "POST" });
      const json = (await res.json()) as WatchRunResult | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      setLastRun(json);
      await qc.invalidateQueries({ queryKey: ["watches"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunningId(null);
    }
  }

  const busy = create.isPending || runningId !== null;
  const reasoner = engines?.openaiConfigured
    ? { label: `OpenAI ${engines.openaiModel}`, ok: true }
    : { label: "OpenAI → Lovable AI 폴백", ok: false };

  return (
    <div className="space-y-5 px-5 py-5">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-5 text-white shadow-xl shadow-indigo-600/20">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-100">
          <Radar className="h-3.5 w-3.5" /> Context Watch
        </div>
        <h2 className="mt-2 text-[19px] font-bold leading-snug">
          키워드가 아니라 <span className="text-indigo-100">의도</span>를 지켜봅니다
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-indigo-100/90">
          원하는 걸 문장으로 적어주세요. AI가 의도·조건·시간·장소를 구조화하고, 그 조건을 만족하는 공개 신호가
          나타나는 순간 근거와 함께 알려줍니다.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={EXAMPLES[0]}
          className="mt-4 w-full resize-none rounded-2xl border border-white/20 bg-white/10 px-3.5 py-3 text-[13px] leading-relaxed text-white placeholder:text-indigo-100/60 focus:border-white/40 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setDraft(ex)}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-indigo-50 hover:bg-white/20"
            >
              예시 {EXAMPLES.indexOf(ex) + 1}
            </button>
          ))}
        </div>
        <button
          disabled={busy || draft.trim().length < 4}
          onClick={() => create.mutate(draft.trim())}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-indigo-700 shadow-lg transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {create.isPending ? "의도 해석 중…" : runningId ? "감시 실행 중…" : "Context Watch 만들기"}
        </button>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
          <Chip ok={reasoner.ok} label={reasoner.label} />
          <Chip ok={Boolean(engines?.grokConfigured)} label={`Grok ${engines?.grokModel ?? ""}`} />
          <Chip
            ok={Boolean(engines?.geminiConfigured)}
            label={engines?.geminiConfigured ? "Gemini Search" : "Gemini → Lovable AI"}
          />
          <Chip ok={Boolean(engines?.daytonaConfigured)} label="Daytona (on-demand)" />
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          공개 소스만 사용합니다. 데이팅앱·로그인 뒤 개인정보, 미성년자, 비공개 프로필은 접근하지 않으며, 사진이나
          이름으로 나이·성별·의향을 추론하지 않습니다. 개인 관련 결과는 본인이 공개적으로 밝힌 문장과 공개 출처
          링크가 있을 때만 표시됩니다.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11.5px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {busy && <StepPanel activeIndex={create.isPending ? 0 : 2} engines={engines} />}

      {lastRun && <RunPanel run={lastRun} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-slate-900">
            내 Context Watch <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Active watches</span>
          </h3>
          {watches.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        {watches.error && (
          <p className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-[11.5px] text-slate-500">
            목록을 불러오지 못했습니다 — {(watches.error as Error).message}
          </p>
        )}
        {watches.data?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-3.5 py-6 text-center text-[11.5px] text-slate-400">
            아직 등록된 Watch가 없습니다. 위에 원하는 걸 문장으로 적어보세요.
          </p>
        )}
        {watches.data?.map((w) => (
          <WatchCard key={w.id} watch={w} running={runningId === w.id} onRun={() => runWatch(w.id)} />
        ))}
      </section>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
        ok ? "bg-emerald-400/20 text-emerald-50" : "bg-amber-400/20 text-amber-50"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-300" : "bg-amber-300"}`} />
      {label}
    </span>
  );
}

function StepPanel({
  activeIndex,
  engines,
}: {
  activeIndex: number;
  engines: ResearchEngineStatus | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Pipeline</div>
      <ol className="mt-3 space-y-2">
        {CONTEXT_STEPS.map((s, i) => {
          const skipped =
            (s.key === "daytona" && !engines?.daytonaConfigured) ||
            (s.key === "search" && !engines?.grokConfigured && !engines?.geminiConfigured && !engines?.lovableAiAvailable);
          const active = i === activeIndex;
          return (
            <li key={s.key} className="flex items-center gap-2.5 text-[11.5px]">
              {skipped ? (
                <Ban className="h-3.5 w-3.5 text-slate-600" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              ) : i < activeIndex ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-slate-700" />
              )}
              <span className={skipped ? "text-slate-600" : active ? "font-semibold text-white" : "text-slate-300"}>
                {s.ko}
              </span>
              {skipped && <span className="text-[10px] text-slate-500">skipped · 연결 필요</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PlanCard({ plan, engine }: { plan: ContextPlan; engine: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
          AI가 해석한 의도
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[9.5px] font-semibold text-indigo-600">
          {engine}
        </span>
      </div>
      <p className="text-[12.5px] font-semibold leading-relaxed text-slate-900">{plan.normalizedIntent}</p>
      {plan.userGoal && <p className="text-[11.5px] leading-relaxed text-slate-600">{plan.userGoal}</p>}
      <PlanRow icon={<Target className="h-3.5 w-3.5" />} label="필수 조건" items={plan.mustHave} />
      <PlanRow icon={<Ban className="h-3.5 w-3.5" />} label="제외 조건" items={plan.mustNotHave} />
      <PlanRow
        icon={<MapPin className="h-3.5 w-3.5" />}
        label="시간 / 장소"
        items={[
          plan.geography.places.join(", ") || "지정 없음",
          `${plan.timeWindow.start?.slice(0, 10) ?? "-"} → ${plan.timeWindow.end?.slice(0, 10) ?? "-"} (${plan.timeWindow.urgency})`,
        ]}
      />
      <PlanRow
        icon={<Radar className="h-3.5 w-3.5" />}
        label="먼저 볼 곳"
        items={plan.sourceStrategy.slice(0, 4).map((s) => `${s.source} — ${s.rationale}`)}
      />
      <PlanRow
        icon={<Clock className="h-3.5 w-3.5" />}
        label="알림 기준"
        items={[`Match ${plan.matchThreshold}점 이상`, `${plan.refreshMinutes}분마다 재확인`]}
      />
    </div>
  );
}

function PlanRow({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-indigo-500">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <ul className="mt-0.5 space-y-0.5">
          {items.map((it) => (
            <li key={it} className="text-[11.5px] leading-relaxed text-slate-700">
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RunPanel({ run }: { run: WatchRunResult }) {
  return (
    <section className="space-y-3">
      <PlanCard plan={run.plan} engine={run.reasonerFallback ? `${run.planEngine} (fallback)` : run.planEngine} />

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {run.enginesUsed.map((e) => (
          <span key={e} className="rounded-full bg-slate-900 px-2 py-0.5 font-semibold text-white">
            {e}
          </span>
        ))}
        <span className="text-slate-400">{(run.elapsedMs / 1000).toFixed(1)}s</span>
        {run.belowThreshold > 0 && (
          <span className="text-slate-400">· 기준 미달 {run.belowThreshold}건 제외</span>
        )}
      </div>

      {run.blockedSources.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            접근하지 않음 · Not accessed
          </div>
          <ul className="mt-1.5 space-y-1">
            {run.blockedSources.map((b) => (
              <li key={b.host} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Ban className="h-3 w-3 text-rose-400" /> {b.host} — {b.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.engineErrors.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] text-amber-800">
          {run.engineErrors.map((e) => (
            <div key={e.engine}>
              {e.engine} 실패 — 다른 엔진 결과는 유지했습니다
            </div>
          ))}
        </div>
      )}

      {run.findings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-3.5 py-6 text-center text-[11.5px] text-slate-500">
          알림 기준을 넘는 결과가 없습니다 — 없는 결과를 만들어내지 않습니다. 잠시 후 자동으로 다시 확인합니다.
        </p>
      ) : (
        run.findings.map((f) => <FindingCard key={f.dedupeKey} finding={f} />)
      )}

      {run.nearMisses.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            알림 기준 미달 · 참고용 (저장·알림하지 않음)
          </div>
          <div className="space-y-2 opacity-70">
            {run.nearMisses.map((f) => (
              <FindingCard key={f.dedupeKey} finding={f} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function FindingCard({ finding: f }: { finding: ContextFinding }) {
  return (
    <article className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[13px] font-bold leading-snug text-slate-900">{f.title}</h4>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-black leading-none text-indigo-600">{f.matchScore}%</div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">match</div>
        </div>
      </div>
      {f.summary && <p className="text-[11.5px] leading-relaxed text-slate-600">{f.summary}</p>}
      {f.whyMatched && (
        <div className="rounded-xl bg-indigo-50/60 px-3 py-2">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-indigo-600">왜 맞는지</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-700">{f.whyMatched}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 text-[9.5px] font-semibold">
        {f.discoveredBy.map((d) => (
          <span key={d} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {d}
          </span>
        ))}
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">{f.sourceType}</span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            f.verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {f.verified ? "Verified" : "확인 필요"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">confidence {f.confidence}</span>
      </div>
      {(f.matchedConstraints.length > 0 || f.missingConstraints.length > 0) && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {f.matchedConstraints.length > 0 && (
            <ul className="space-y-0.5">
              {f.matchedConstraints.map((c) => (
                <li key={c} className="flex gap-1.5 text-[11px] text-emerald-700">
                  <CheckCircle2 className="mt-[1px] h-3 w-3 shrink-0" /> {c}
                </li>
              ))}
            </ul>
          )}
          {f.missingConstraints.length > 0 && (
            <ul className="space-y-0.5">
              {f.missingConstraints.map((c) => (
                <li key={c} className="flex gap-1.5 text-[11px] text-slate-500">
                  <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0 text-amber-500" /> {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {f.contradiction.length > 0 && (
        <ul className="space-y-0.5">
          {f.contradiction.map((c) => (
            <li key={c} className="text-[11px] text-rose-600">
              모순: {c}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <a
          href={f.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
        >
          원문 보기 <ExternalLink className="h-3 w-3" />
        </a>
        {f.firstSeenAt && (
          <span className="text-[10px] text-slate-400">first seen {f.firstSeenAt.slice(0, 16).replace("T", " ")}</span>
        )}
      </div>
    </article>
  );
}

function WatchCard({
  watch,
  running,
  onRun,
}: {
  watch: WatchWithFindings;
  running: boolean;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold leading-snug text-slate-900">{watch.intentSummary || watch.rawQuery}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{watch.rawQuery}</p>
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          지금 확인
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{watch.refreshMinutes}분 주기</span>
        <span>다음 확인 {watch.nextRunAt?.slice(0, 16).replace("T", " ")}</span>
        {watch.lastStatus && <span>· {watch.lastStatus}</span>}
      </div>
      {watch.findings.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-[11px] font-semibold text-indigo-600 hover:underline"
          >
            발견 {watch.findings.length}건 {open ? "접기" : "보기"}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              {watch.findings.map((f) => (
                <FindingCard key={f.dedupeKey} finding={f} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
