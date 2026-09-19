import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bell,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Radar,
  Search,

  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  X,
} from "lucide-react";
import {
  RUN_STEP_LABELS,
  SAMPLE_COMPANY_PROFILE,
  type Opportunity,
  type RunResult,
  type RunResultOk,
  type RunStep,
} from "@/lib/daytona/types";
import {
  RESEARCH_STEPS,
  type ResearchEngine,
  type ResearchEngineStatus,
  type ResearchResponse,
  type ResearchResultItem,
} from "@/lib/research/types";
import {
  clearRuns,
  loadOpportunities,
  loadRuns,
  resetDemoData,
  saveOpportunities,
  saveRun,
} from "@/lib/daytona/storage";
import { ContextWatchTab } from "@/components/keyp/ContextWatchTab";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KeyP × Daytona — Opportunity Agent" },
      {
        name: "description",
        content:
          "KeyP doesn't just find opportunities. It executes the work required to pursue them. 관심사에서 실행까지 — Daytona 샌드박스에서 지원 패키지를 자동 생성합니다.",
      },
      { property: "og:title", content: "KeyP × Daytona — Opportunity Agent" },
      {
        property: "og:description",
        content: "From Interest to Action. AI 에이전트가 기회를 찾고, Daytona 샌드박스에서 지원 서류까지 만듭니다.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KeypDaytonaApp,
});

type Tab = "watches" | "dashboard" | "opportunities" | "runs" | "results";

function KeypDaytonaApp() {
  const [tab, setTab] = useState<Tab>("watches");
  const [hydrated, setHydrated] = useState(false);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [runs, setRuns] = useState<RunResultOk[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [detail, setDetail] = useState<RunResultOk | null>(null);
  const [research, setResearch] = useState<{ query: string; enginesUsed: ResearchEngine[] } | null>(null);

  const status = useQuery({
    queryKey: ["research-status"],
    queryFn: async () => {
      const res = await fetch("/api/research/status");
      return (await res.json()) as ResearchEngineStatus;
    },
    staleTime: 30_000,
  });
  const st = status.data;
  const configured = st?.daytonaConfigured ?? false;

  useEffect(() => {
    setOpportunities(loadOpportunities());
    setRuns(loadRuns());
    setHydrated(true);
  }, []);

  function updateOpportunities(next: Opportunity[]) {
    setOpportunities(next);
    saveOpportunities(next);
  }

  function onRunComplete(run: RunResultOk) {
    setRuns(saveRun(run));
  }

  function onResetDemo() {
    const { opportunities: o, runs: r } = resetDemoData();
    setOpportunities(o);
    setRuns(r);
    setSelected(null);
    setDetail(null);
    setResearch(null);
  }

  return (
    <div className="min-h-screen bg-slate-950/[0.03] bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col bg-white shadow-2xl md:max-w-[820px]">
        <TopBar tab={tab} configured={configured} />
        <main className="flex-1 overflow-y-auto pb-28">
          {!hydrated ? null : tab === "watches" ? (
            <ContextWatchTab engines={st} />
          ) : tab === "dashboard" ? (

            <DashboardTab
              opportunities={opportunities}
              runs={runs}
              engines={st}
              statusLoading={status.isLoading}
              onFind={() => setTab("opportunities")}
              onResetDemo={onResetDemo}
            />
          ) : tab === "opportunities" ? (
            <OpportunitiesTab
              opportunities={opportunities}
              engines={st}
              onChange={updateOpportunities}
              onResearch={setResearch}
              onSelect={(o) => {
                setSelected(o);
                setTab("runs");
              }}
            />
          ) : tab === "runs" ? (
            <AgentRunsTab
              opportunity={selected}
              configured={configured}
              research={research}
              onComplete={onRunComplete}
              onGoOpportunities={() => setTab("opportunities")}
              onGoResults={() => setTab("results")}
            />
          ) : (
            <ResultsTab
              runs={runs}
              onOpen={setDetail}
              onClear={() => {
                clearRuns();
                setRuns([]);
              }}
            />
          )}
        </main>
        <BottomNav tab={tab} setTab={setTab} />
      </div>
      {detail && <ResultDetailSheet run={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}


/* ─────────── Chrome ─────────── */

const TAB_TITLES: Record<Tab, { ko: string; en: string }> = {
  watches: { ko: "관심 감시", en: "Context Watch" },
  dashboard: { ko: "대시보드", en: "Dashboard" },
  opportunities: { ko: "기회 탐색", en: "Opportunities" },
  runs: { ko: "에이전트 실행", en: "Agent Runs" },
  results: { ko: "결과", en: "Results" },
};


function TopBar({ tab, configured }: { tab: Tab; configured: boolean }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-5 py-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-black text-white shadow-lg shadow-indigo-600/25">
          K
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
            KeyP × Daytona
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-slate-900">{TAB_TITLES[tab].ko}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {TAB_TITLES[tab].en}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-emerald-500" : "bg-amber-500"}`} />
          {configured ? "Daytona" : "연결 필요"}
        </span>
        <Bell className="h-5 w-5 text-slate-300" />
      </div>
    </header>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ id: Tab; icon: React.ReactNode }> = [
    { id: "watches", icon: <Radar className="h-5 w-5" /> },
    { id: "dashboard", icon: <Layers className="h-5 w-5" /> },
    { id: "opportunities", icon: <Target className="h-5 w-5" /> },
    { id: "runs", icon: <Terminal className="h-5 w-5" /> },
    { id: "results", icon: <FileText className="h-5 w-5" /> },
  ];
  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[520px] -translate-x-1/2 border-t border-slate-100 bg-white/95 backdrop-blur md:max-w-[720px]">
      <ul className="grid grid-cols-5">

        {items.map((it) => {
          const active = tab === it.id;
          return (
            <li key={it.id}>
              <button
                onClick={() => setTab(it.id)}
                className={`flex w-full flex-col items-center gap-1 py-3 transition ${
                  active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {it.icon}
                <span className="text-[11px] font-semibold">{TAB_TITLES[it.id].ko}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-70">
                  {TAB_TITLES[it.id].en}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ─────────── 1. Dashboard ─────────── */

function DashboardTab({
  opportunities,
  runs,
  engines,
  statusLoading,
  onFind,
  onResetDemo,
}: {
  opportunities: Opportunity[];
  runs: RunResultOk[];
  engines?: ResearchEngineStatus;
  statusLoading: boolean;
  onFind: () => void;
  onResetDemo: () => void;
}) {
  const configured = engines?.daytonaConfigured ?? false;

  const readyToApply = runs.filter((r) => r.eligible !== "no").length;
  const avgMatch =
    opportunities.length === 0
      ? 0
      : Math.round(opportunities.reduce((a, b) => a + (b.matchScore || 0), 0) / opportunities.length);

  return (
    <div className="p-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 p-6 text-white shadow-xl shadow-indigo-600/20">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
          KeyP × Daytona
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-snug">From Interest to Action.</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          KeyP는 기회를 찾는 데서 멈추지 않습니다. 그 기회를 잡기 위해 필요한 일까지 직접 실행합니다.
        </p>
        <button
          onClick={onFind}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:bg-indigo-50"
        >
          <Search className="h-4 w-4" />
          기회 찾기
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard label="Opportunities Found" ko="발견한 기회" value={opportunities.length} icon={<Target className="h-4 w-4" />} />
        <StatCard label="Ready to Apply" ko="지원 가능" value={readyToApply} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Agent Runs" ko="에이전트 실행" value={runs.length} icon={<Terminal className="h-4 w-4" />} />
        <StatCard label="Avg. Match" ko="평균 적합도" value={`${avgMatch}%`} icon={<Activity className="h-4 w-4" />} />
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <ShieldCheck className="h-4 w-4" />
          System Status
        </div>
        <ul className="space-y-2">
          <SystemRow name="KeyP Planner" state="ok" note="온라인" />
          <SystemRow
            name="Daytona Sandbox"
            state={statusLoading ? "loading" : configured ? "ok" : "warn"}
            note={statusLoading ? "확인 중…" : configured ? "Connected" : "Not connected · 연결 필요"}
          />
          <SystemRow
            name="Gemini Web Search"
            state={statusLoading ? "loading" : engines?.geminiConfigured || engines?.lovableAiAvailable ? "ok" : "warn"}
            note={
              statusLoading
                ? "확인 중…"
                : engines?.geminiConfigured
                  ? `Google Search grounding · ${engines.geminiModel}`
                  : engines?.lovableAiAvailable
                    ? "Lovable AI 폴백 · 모델 지식 기반 (라이브 검색 아님)"
                    : "연결 필요 · GEMINI_API_KEY"
            }
          />
          <SystemRow
            name="Grok X Search"
            state={statusLoading ? "loading" : engines?.grokConfigured ? "ok" : "warn"}
            note={
              statusLoading
                ? "확인 중…"
                : engines?.grokConfigured
                  ? `x_search + web_search · ${engines.grokModel}`
                  : "연결 필요 · XAI_API_KEY"
            }
          />
        </ul>
        {!statusLoading && !configured && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
            DAYTONA_API_KEY가 설정되지 않아 실제 샌드박스 실행과 라이브 리서치는 비활성 상태입니다. 발표용으로는 DEMO
            버튼으로 시뮬레이션 실행을 볼 수 있으며, 시뮬레이션은 항상 <b>DEMO RUN</b>으로 표시됩니다.
          </p>
        )}
        {!statusLoading && !engines?.geminiConfigured && (
          <p className="mt-2 rounded-lg bg-slate-100 p-2.5 text-[11px] leading-relaxed text-slate-600">
            GEMINI_API_KEY 미설정 — 직접 Google Search 그라운딩은 사용할 수 없습니다.
            {engines?.lovableAiAvailable
              ? " 질의 설계·요약용 추론 폴백(Lovable AI · Gemini)만 사용됩니다."
              : ""}
          </p>
        )}
        {!statusLoading && !engines?.grokConfigured && (
          <p className="mt-2 rounded-lg bg-slate-100 p-2.5 text-[11px] leading-relaxed text-slate-600">
            XAI_API_KEY 미설정 — X(트위터) 검색은 실행되지 않으며 가짜 X 결과를 만들지 않습니다. Cursor의 Grok
            크레딧은 Cursor 안에서만 적용되며 이 앱의 xAI API 결제로 사용할 수 없습니다.
          </p>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          <Layers className="h-3.5 w-3.5" />
          Architecture
        </div>
        <pre className="overflow-x-auto font-mono text-[10px] leading-relaxed text-emerald-300">{`KeyP Planner
  → Daytona Sandbox (isolated runtime)
    → Gemini Google Search + Grok X Search
    → Direct Source Verification (HTTP GET)
    → Evidence Fusion
  → Eligibility / Application Package`}</pre>
      </section>




      <button
        onClick={onResetDemo}
        className="mx-auto mt-6 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 transition hover:text-indigo-600"
      >
        <RotateCcw className="h-3 w-3" />
        데모 데이터 초기화
      </button>
    </div>
  );
}

function StatCard({
  label,
  ko,
  value,
  icon,
}: {
  label: string;
  ko: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-indigo-600">{icon}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] font-semibold text-slate-600">{ko}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function SystemRow({ name, state, note }: { name: string; state: "ok" | "warn" | "loading"; note: string }) {
  const dot =
    state === "ok" ? "bg-emerald-500" : state === "warn" ? "bg-amber-500" : "bg-slate-300 animate-pulse";
  const text = state === "ok" ? "text-emerald-700" : state === "warn" ? "text-amber-700" : "text-slate-400";
  return (
    <li className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
      <span className="text-xs font-semibold text-slate-800">{name}</span>
      <span className={`flex items-center gap-1.5 text-[11px] font-medium ${text}`}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {note}
      </span>
    </li>
  );
}

/* ─────────── 2. Opportunities ─────────── */

function OpportunitiesTab({
  opportunities,
  engines,
  onChange,
  onResearch,
  onSelect,
}: {
  opportunities: Opportunity[];
  engines?: ResearchEngineStatus;
  onChange: (l: Opportunity[]) => void;
  onResearch: (r: { query: string; enginesUsed: ResearchEngine[] } | null) => void;
  onSelect: (o: Opportunity) => void;
}) {
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<{
    sandboxId: string;
    enginesUsed: ResearchEngine[];
    note?: string;
    errors: Array<{ engine: string; message: string }>;
    count: number;
  } | null>(null);
  const examples = [
    "서울 소재 AI 스타트업이 지원할 수 있는 정부지원사업, 공모전, 해커톤 찾아줘",
    "AI 교육 콘텐츠 기업 대상 글로벌 그랜트",
  ];

  const search = useMutation({
    mutationFn: async (query: string) => {
      setMeta(null);
      const res = await fetch("/api/research/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, companyProfile: SAMPLE_COMPANY_PROFILE, maxResults: 8 }),
      });
      const json = (await res.json()) as ResearchResponse;
      if (!json.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: (res) => {
      const found: Opportunity[] = res.results.map((r: ResearchResultItem) => ({ ...r }));
      const ids = new Set(found.map((f) => f.id));
      onChange([...found, ...opportunities.filter((o) => !ids.has(o.id))]);
      onResearch({ query: res.query, enginesUsed: res.enginesUsed });
      setMeta({
        sandboxId: res.sandboxId,
        enginesUsed: res.enginesUsed,
        note: res.liveSearchNote,
        errors: res.engineErrors,
        count: res.results.length,
      });
    },
  });

  const live = opportunities.filter((o) => !o.sample);
  const samples = opportunities.filter((o) => o.sample);

  return (
    <div className="p-5">
      <label className="text-xs font-semibold text-slate-500">
        어떤 기회를 찾을까요? <span className="text-slate-400">(자연어로 입력)</span>
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="예: 서울 소재 AI 스타트업이 지원할 수 있는 정부지원사업, 공모전, 해커톤 찾아줘"
        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((e) => (
          <button
            key={e}
            onClick={() => setText(e)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
          >
            {e.slice(0, 26)}…
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <EngineChip label="Daytona" on={engines?.daytonaConfigured} />
        <EngineChip
          label={engines?.geminiConfigured ? "Gemini" : "Gemini → Lovable AI"}
          on={engines?.geminiConfigured || engines?.lovableAiAvailable}
        />
        <EngineChip label="Grok" on={engines?.grokConfigured} />
      </div>

      <button
        onClick={() => search.mutate(text.trim())}
        disabled={!text.trim() || search.isPending}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
      >
        {search.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Live Research 실행 중…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Live Research
          </>
        )}
      </button>

      {(search.isPending || meta) && (
        <section className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Terminal className="h-3.5 w-3.5" />
              Research progress
            </div>
            {meta && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400">
                sandbox {meta.sandboxId.slice(0, 12)}
              </span>
            )}
          </div>
          <ol className="space-y-1.5">
            {RESEARCH_STEPS.map((s, i) => {
              const lovableFallback = s.key === "gemini" && !engines?.geminiConfigured && engines?.lovableAiAvailable;
              const skipped =
                (s.key === "gemini" && !engines?.geminiConfigured && !engines?.lovableAiAvailable) ||
                (s.key === "grok" && !engines?.grokConfigured);
              return (
                <li key={s.key} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                      meta ? (skipped ? "bg-slate-700 text-slate-400" : "bg-emerald-500 text-slate-950") : "bg-indigo-500/70 text-white"
                    }`}
                  >
                    {meta ? (skipped ? "–" : "✓") : i + 1}
                  </span>
                  <span className={skipped ? "text-slate-500" : "text-slate-200"}>{s.ko}</span>
                  <span className="font-mono text-[9px] text-slate-500">{s.en}</span>
                  {lovableFallback && <span className="text-[9px] text-indigo-400">Lovable AI 폴백 · 모델 지식</span>}
                  {skipped && <span className="text-[9px] text-amber-500">skipped · 연결 필요</span>}
                </li>
              );
            })}
          </ol>
          {meta && (
            <div className="mt-3 border-t border-slate-800 pt-2 font-mono text-[10px] leading-relaxed text-emerald-300">
              engines: {meta.enginesUsed.length ? meta.enginesUsed.join(" + ") : "none"} · results: {meta.count}
              {meta.errors.map((e) => (
                <div key={e.engine} className="text-amber-400">
                  {e.engine} error: {e.message.slice(0, 120)}
                </div>
              ))}
              {meta.note && <div className="text-amber-400">{meta.note}</div>}
            </div>
          )}
        </section>
      )}

      {search.isError && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          라이브 리서치를 실행하지 못했습니다 — 결과를 대신 만들어내지 않습니다.
          <div className="mt-1 font-mono text-[10px]">{(search.error as Error).message}</div>
        </div>
      )}

      {live.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold">LIVE RESULTS</span>
            {live.length}건
          </div>
          {live.map((o) => (
            <OpportunityCard key={o.id} o={o} onRun={() => onSelect(o)} />
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            SAMPLE DATA
          </span>
          발표 백업용 예시 {samples.length}건 (실제 공고 아님)
        </div>
        {samples.map((o) => (
          <OpportunityCard key={o.id} o={o} onRun={() => onSelect(o)} />
        ))}
      </div>
    </div>
  );
}

function EngineChip({ label, on }: { label: string; on?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "indigo" | "violet" | "slate" | "emerald" | "amber" | "dark" }) {
  const map = {
    indigo: "bg-indigo-50 text-indigo-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    dark: "bg-slate-900 text-white",
  } as const;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map[tone]}`}>{children}</span>;
}

function OpportunityCard({ o, onRun }: { o: Opportunity; onRun: () => void }) {
  const evidence = o.sourceEvidence ?? [];
  const xEv = o.xEvidence ?? [];
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="indigo">{o.category}</Badge>
        {o.sample && <Badge tone="slate">SAMPLE DATA</Badge>}
        {o.discoveredBy?.includes("gemini") && <Badge tone="violet">Gemini</Badge>}
        {o.discoveredBy?.includes("lovable") && <Badge tone="indigo">Lovable AI</Badge>}
        {o.discoveredBy?.includes("grok") && <Badge tone="violet">Grok</Badge>}
        {xEv.length > 0 && <Badge tone="dark">X</Badge>}
        {o.sourceType === "official" && <Badge tone="emerald">Official</Badge>}
        {!o.sample &&
          (o.verified ? <Badge tone="emerald">Verified</Badge> : <Badge tone="amber">Needs verification</Badge>)}
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          Match {o.matchScore}%
        </span>
      </div>
      <h3 className="text-sm font-bold leading-snug text-slate-900">{o.title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{o.summary || o.why}</p>
      <dl className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
        <Meta label="주최" value={o.organizer} />
        <Meta label="마감" value={o.deadline} />
        <Meta label="지역" value={o.location} />
        {typeof o.confidence === "number" && <Meta label="신뢰도" value={`${o.confidence}%`} />}
      </dl>

      {(evidence.length > 0 || xEv.length > 0) && (
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Sources · web {evidence.length} / X {xEv.length}
          </div>
          {[...evidence, ...xEv].slice(0, 4).map((e) => (
            <a
              key={e.url}
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-mono text-[10px] text-indigo-600 hover:underline"
            >
              [{e.engine}
              {e.statusCode ? ` ${e.statusCode}` : ""}] {e.url}
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {o.sourceType === "official" && o.verified ? "공식 출처" : "출처 링크"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={onRun}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-[11px] font-bold text-white transition hover:bg-slate-800"
        >
          <Play className="h-3 w-3" />
          Run Opportunity Agent
        </button>
      </div>
    </article>
  );
}


function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}

/* ─────────── 3. Agent Runs ─────────── */

function AgentRunsTab({
  opportunity,
  configured,
  research,
  onComplete,
  onGoOpportunities,
  onGoResults,
}: {
  opportunity: Opportunity | null;
  configured: boolean;
  research: { query: string; enginesUsed: ResearchEngine[] } | null;
  onComplete: (r: RunResultOk) => void;
  onGoOpportunities: () => void;
  onGoResults: () => void;
}) {

  const [steps, setSteps] = useState<RunStep[]>([]);
  const [result, setResult] = useState<RunResultOk | null>(null);
  const [error, setError] = useState<{ code: string; message: string; log?: string[] } | null>(null);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const run = useMutation({
    mutationFn: async (demoMode: boolean) => {
      if (!opportunity) throw new Error("기회를 먼저 선택하세요.");
      setResult(null);
      setError(null);
      setLiveLog([demoMode ? "$ keyp agent run --demo" : "$ keyp agent run --daytona"]);
      setSteps(RUN_STEP_LABELS.map((s) => ({ key: s.key, label: s.label, status: "pending" })));
      // progressive UI feedback while the server call is in flight
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = RUN_STEP_LABELS.map((s, i) =>
        window.setTimeout(() => {
          setSteps((prev) => prev.map((p) => (p.key === s.key ? { ...p, status: "running" } : p)));
        }, 350 * i),
      );

      const res = await fetch("/api/daytona/run-opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity,
          companyProfile: SAMPLE_COMPANY_PROFILE,
          demoMode: demoMode || undefined,
          research: opportunity.sample ? undefined : (research ?? undefined),
        }),

      });
      return (await res.json()) as RunResult;
    },
    onSuccess: (res) => {
      timers.current.forEach((t) => clearTimeout(t));
      if (res.ok) {
        setSteps(res.steps);
        setLiveLog((l) => [...l, ...res.log]);
        setResult(res);
        onComplete(res);
      } else {
        setSteps(res.steps ?? []);
        setLiveLog((l) => [...l, ...(res.log ?? []), `! ${res.error}`]);
        setError({ code: res.code, message: res.error, log: res.log });
      }
    },
    onError: (e) => {
      timers.current.forEach((t) => clearTimeout(t));
      setError({ code: "network", message: (e as Error).message });
    },
  });

  if (!opportunity) {
    return (
      <div className="p-8 text-center">
        <Box className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">실행할 기회를 먼저 선택해주세요.</p>
        <button
          onClick={onGoOpportunities}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
        >
          기회 탐색으로 이동
        </button>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
            <Box className="h-3 w-3" />
            Daytona Sandbox
          </span>
          {opportunity.sample && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
              SAMPLE DATA
            </span>
          )}
        </div>
        <h2 className="text-sm font-bold leading-snug text-slate-900">{opportunity.title}</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          {opportunity.organizer} · {opportunity.deadline}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => run.mutate(false)}
          disabled={run.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
        >
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          REAL RUN
        </button>
        <button
          onClick={() => run.mutate(true)}
          disabled={run.isPending}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          DEMO
        </button>
      </div>
      {!configured && (
        <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
          Daytona 미연결 상태 — REAL RUN은 실패하고 명확한 안내를 반환합니다. DEMO는 시뮬레이션으로만 표시됩니다.
        </p>
      )}

      {/* execution console */}
      {(run.isPending || steps.length > 0 || liveLog.length > 0) && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Terminal className="h-3.5 w-3.5" />
              Execution
            </div>
            {result && (
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider ${
                  result.mode === "real" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {result.mode === "real" ? "REAL RUN" : "DEMO RUN"}
              </span>
            )}
          </div>

          <ol className="space-y-0 px-4 py-3">
            {(steps.length
              ? steps
              : RUN_STEP_LABELS.map<RunStep>((s) => ({ key: s.key, label: s.label, status: "pending" }))
            ).map(
              (s, i) => {
                const ko = RUN_STEP_LABELS.find((x) => x.key === s.key)?.ko ?? "";
                return (
                  <li key={s.key} className="flex gap-3 pb-3 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold ${
                          s.status === "done"
                            ? "bg-emerald-500 text-slate-950"
                            : s.status === "running"
                              ? "bg-indigo-500 text-white"
                              : s.status === "failed"
                                ? "bg-red-500 text-white"
                                : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        {s.status === "done" ? "✓" : s.status === "running" ? "•" : s.status === "failed" ? "!" : i + 1}
                      </span>
                      {i < RUN_STEP_LABELS.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-slate-800" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div
                        className={`text-xs font-semibold ${
                          s.status === "pending" ? "text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {ko}
                        <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-500">{s.label}</span>
                      </div>
                      {s.detail && (
                        <div className="mt-0.5 truncate font-mono text-[10px] text-indigo-300">{s.detail}</div>
                      )}
                    </div>
                  </li>
                );
              },
            )}
          </ol>

          {liveLog.length > 0 && (
            <pre className="max-h-48 overflow-y-auto border-t border-slate-800 bg-black/40 px-4 py-3 font-mono text-[10px] leading-relaxed text-emerald-300">
              {liveLog.join("\n")}
            </pre>
          )}
        </section>
      )}

      {error && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-bold text-amber-900">
            {error.code === "not_configured" ? "Daytona 연결 필요" : "실행 실패"}
          </div>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-amber-800">{error.message}</p>
          {error.code === "not_configured" && (
            <p className="mt-2 text-[11px] text-amber-800">
              Project Settings → Secrets 에 <b>DAYTONA_API_KEY</b>를 추가하면 실제 샌드박스 실행이 활성화됩니다.
              지금은 DEMO 버튼으로 시뮬레이션을 볼 수 있습니다.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <RunSummary run={result} />
          <button
            onClick={onGoResults}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            결과 보기
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function eligibleStyle(e: RunResultOk["eligible"]) {
  return e === "yes"
    ? { bg: "bg-emerald-50", text: "text-emerald-700", label: "Eligible: YES" }
    : e === "review"
      ? { bg: "bg-amber-50", text: "text-amber-700", label: "Eligible: REVIEW" }
      : { bg: "bg-red-50", text: "text-red-700", label: "Eligible: NO" };
}

function RunSummary({ run }: { run: RunResultOk }) {
  const el = eligibleStyle(run.eligible);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-3xl font-black text-slate-900">{run.matchScore}%</span>
        <span className="text-[11px] font-semibold text-slate-500">Match Score</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${el.bg} ${el.text}`}>
          {el.label}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span
          className={`rounded px-1.5 py-0.5 font-bold ${
            run.mode === "real" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {run.mode === "real" ? "REAL RUN" : "DEMO RUN"}
        </span>
        {run.sandboxId && <span className="font-mono">sandbox {run.sandboxId.slice(0, 12)}</span>}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {(run.elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="rounded bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">
          Research Engines: {run.enginesUsed?.length ? run.enginesUsed.join(" + ") : "none (evidence 없음)"}
        </span>
        <span>evidence {run.evidenceCount ?? 0}</span>
        <span>X sources {run.xSourceCount ?? 0}</span>
        {run.eligibilityEngine && (
          <span className="font-mono">eligibility: {run.eligibilityEngine}</span>
        )}
      </div>


      {run.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {run.reasons.map((r) => (
            <li key={r} className="font-mono text-[10px] text-slate-600">
              {r}
            </li>
          ))}
        </ul>
      )}

      {run.missingDocuments.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Missing documents</div>
          <ul className="mt-1.5 space-y-1">
            {run.missingDocuments.map((m) => (
              <li key={m} className="text-[11px] text-slate-700">
                ☐ {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {run.files.map((f) => (
          <FileRow key={f.name} name={f.name} content={f.content} />
        ))}
      </div>
    </div>
  );
}

function FileRow({ name, content }: { name: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <FileText className="h-3.5 w-3.5 text-indigo-500" />
        <span className="flex-1 truncate font-mono">/output/{name}</span>
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <pre className="max-h-56 overflow-auto border-t border-slate-100 bg-slate-950 px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-slate-200">
          {content}
        </pre>
      )}
    </div>
  );
}

/* ─────────── 4. Results ─────────── */

function ResultsTab({
  runs,
  onOpen,
  onClear,
}: {
  runs: RunResultOk[];
  onOpen: (r: RunResultOk) => void;
  onClear: () => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        아직 실행 결과가 없어요. 기회를 선택해 Opportunity Agent를 실행해보세요.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500">실행 기록 {runs.length}건</div>
        <button onClick={onClear} className="text-[11px] text-slate-400 hover:text-red-500">
          전체 삭제
        </button>
      </div>
      {runs.map((r) => {
        const el = eligibleStyle(r.eligible);
        return (
          <button
            key={`${r.startedAt}-${r.opportunity.id}`}
            onClick={() => onOpen(r)}
            className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                  r.mode === "real" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {r.mode === "real" ? "REAL RUN" : "DEMO RUN"}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${el.bg} ${el.text}`}>{el.label}</span>
              <span className="ml-auto text-sm font-black text-slate-900">{r.matchScore}%</span>
            </div>
            <div className="mt-2 text-xs font-bold leading-snug text-slate-900">{r.opportunity.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span>{new Date(r.finishedAt).toLocaleString("ko-KR")}</span>
              {r.sandboxId && <span className="font-mono">sandbox {r.sandboxId.slice(0, 12)}</span>}
              <span>{r.files.length} files</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ResultDetailSheet({ run, onClose }: { run: RunResultOk; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-5 md:max-w-[720px]">
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Run detail</div>
            <h3 className="text-sm font-bold leading-snug text-slate-900">{run.opportunity.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <RunSummary run={run} />
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Step log</div>
          <pre className="max-h-56 overflow-y-auto border-t border-slate-800 px-4 py-3 font-mono text-[10px] leading-relaxed text-emerald-300">
            {run.log.join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}
