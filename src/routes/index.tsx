import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Home, Plus, Search, Sparkles, User, X, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { keypClient } from "@/lib/keyp/client";
import type { KeypFeedItem, SnsPlatform } from "@/lib/keyp/types";
import {
  loadFeed,
  loadInterests,
  prependFeed,
  saveInterests,
  type Interest,
} from "@/lib/keyp/storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KeyP — 실시간 관심사 알림" },
      {
        name: "description",
        content:
          "관심사를 등록하면 AI 에이전트 팀이 SNS를 탐색·검증·요약해 실시간으로 알려주는 KeyP.",
      },
      { property: "og:title", content: "KeyP — 실시간 관심사 알림" },
      {
        property: "og:description",
        content: "AI가 유튜브·인스타·링크드인 등 모든 SNS를 대신 탐색·검증합니다.",
      },
    ],
  }),
  component: KeypApp,
});

type Tab = "home" | "add" | "feed" | "match";

function KeypApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [interests, setInterests] = useState<Interest[]>([]);
  const [feed, setFeed] = useState<KeypFeedItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInterests(loadInterests());
    setFeed(loadFeed());
    setHydrated(true);
  }, []);

  function updateInterests(next: Interest[]) {
    setInterests(next);
    saveInterests(next);
  }

  function onFeedChange(items: KeypFeedItem[]) {
    const merged = prependFeed(items);
    setFeed(merged);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col bg-white shadow-2xl">
        <TopBar tab={tab} />
        <main className="flex-1 overflow-y-auto pb-24">
          {!hydrated ? null : tab === "home" ? (
            <HomeTab
              interests={interests}
              onChange={updateInterests}
              feedCount={feed.length}
              onAdd={() => setTab("add")}
            />
          ) : tab === "add" ? (
            <AddTab
              onDone={(newInterest, items) => {
                updateInterests([newInterest, ...interests]);
                onFeedChange(items);
                setTab("feed");
              }}
            />
          ) : tab === "feed" ? (
            <FeedTab feed={feed} onClear={() => { setFeed([]); localStorage.removeItem("keyp.feed"); }} />
          ) : (
            <MatchTab interests={interests} />
          )}
        </main>
        <BottomNav tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

function TopBar({ tab }: { tab: Tab }) {
  const titles: Record<Tab, string> = {
    home: "내 관심사",
    add: "관심사 추가",
    feed: "속보 피드",
    match: "상호매칭",
  };
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-5 py-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-black text-white">K</div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-600">KeyP</div>
          <div className="text-base font-bold text-slate-900">{titles[tab]}</div>
        </div>
      </div>
      <Bell className="h-5 w-5 text-slate-400" />
    </header>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "home", label: "홈", icon: <Home className="h-5 w-5" /> },
    { id: "add", label: "추가", icon: <Plus className="h-5 w-5" /> },
    { id: "feed", label: "피드", icon: <Sparkles className="h-5 w-5" /> },
    { id: "match", label: "매칭", icon: <User className="h-5 w-5" /> },
  ];
  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-slate-100 bg-white/95 backdrop-blur">
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <li key={it.id}>
              <button
                onClick={() => setTab(it.id)}
                className={`flex w-full flex-col items-center gap-1 py-3 text-[11px] transition ${
                  active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {it.icon}
                <span className="font-medium">{it.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ─────────── Home ─────────── */
function HomeTab({
  interests,
  onChange,
  feedCount,
  onAdd,
}: {
  interests: Interest[];
  onChange: (l: Interest[]) => void;
  feedCount: number;
  onAdd: () => void;
}) {
  return (
    <div className="p-5">
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
        <div className="text-xs opacity-80">등록된 관심사</div>
        <div className="mt-1 text-3xl font-bold">{interests.length}개</div>
        <div className="mt-3 flex items-center gap-2 text-xs opacity-90">
          <Sparkles className="h-4 w-4" />
          누적 알림 {feedCount}건
        </div>
      </div>

      {interests.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <ul className="space-y-2">
          {interests.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">{it.label}</div>
                <div className="text-xs text-slate-400">실시간 알림</div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={it.enabled}
                  onChange={(e) =>
                    onChange(interests.map((x) => (x.id === it.id ? { ...x, enabled: e.target.checked } : x)))
                  }
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
              </label>
              <button
                onClick={() => onChange(interests.filter((x) => x.id !== it.id))}
                className="text-slate-300 hover:text-red-500"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onAdd}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        관심사 추가
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-indigo-600">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold text-slate-900">아직 관심사가 없어요</div>
      <div className="mt-1 text-xs text-slate-500">궁금한 걸 한 문장으로 입력해보세요.</div>
      <button
        onClick={onAdd}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
      >
        첫 관심사 만들기
      </button>
    </div>
  );
}

/* ─────────── Add ─────────── */
function AddTab({
  onDone,
}: {
  onDone: (i: Interest, items: KeypFeedItem[]) => void;
}) {
  const [text, setText] = useState("");
  const suggestions = ["도쿄 맛집 추천", "AI 스타트업 투자 기회", "BTS 월드투어 일정", "해외 축구 이적시장", "서울 신규 카페"];

  const mutation = useMutation({
    mutationFn: async (interest: string) => {
      const res = await keypClient.search({ interest, limit: 5 });
      if (!("ok" in res) || !res.ok) throw new Error(("error" in res && res.error) || "실패");
      return res;
    },
    onSuccess: (res) => {
      const newInterest: Interest = {
        id: `${Date.now()}`,
        label: res.interest,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      onDone(newInterest, res.items);
    },
  });

  return (
    <div className="p-5">
      <label className="text-xs font-semibold text-slate-500">어떤 관심사를 등록할까요?</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="예: 도쿄 맛집 추천, 뉴욕 여행, AI 스타트업 투자 기회, BTS 월드투어 일정…"
        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
      />

      <div className="mt-3">
        <div className="text-xs font-semibold text-slate-500">예시 키워드</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setText(s)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => mutation.mutate(text.trim())}
        disabled={!text.trim() || mutation.isPending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
      >
        {mutation.isPending ? (
          <>
            <Search className="h-4 w-4 animate-pulse" />
            AI 에이전트 팀 작업 중…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            AI 분석 시작
          </>
        )}
      </button>

      {mutation.isError && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {(mutation.error as Error).message}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-400">
        AI가 의도를 분석하고 최적의 검색 전략을 설계합니다.
      </p>
    </div>
  );
}

/* ─────────── Feed ─────────── */
const platformStyle: Record<SnsPlatform, { bg: string; text: string; label: string }> = {
  youtube: { bg: "bg-red-50", text: "text-red-600", label: "YouTube" },
  instagram: { bg: "bg-pink-50", text: "text-pink-600", label: "Instagram" },
  facebook: { bg: "bg-blue-50", text: "text-blue-600", label: "Facebook" },
  linkedin: { bg: "bg-sky-50", text: "text-sky-700", label: "LinkedIn" },
  x: { bg: "bg-slate-100", text: "text-slate-900", label: "X" },
  tiktok: { bg: "bg-slate-100", text: "text-slate-900", label: "TikTok" },
  reddit: { bg: "bg-orange-50", text: "text-orange-600", label: "Reddit" },
  news: { bg: "bg-emerald-50", text: "text-emerald-700", label: "뉴스" },
  blog: { bg: "bg-amber-50", text: "text-amber-700", label: "블로그" },
  community: { bg: "bg-violet-50", text: "text-violet-700", label: "커뮤니티" },
  other: { bg: "bg-slate-100", text: "text-slate-600", label: "기타" },
};

function FeedTab({ feed, onClear }: { feed: KeypFeedItem[]; onClear: () => void }) {
  if (feed.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        아직 알림이 없어요. 관심사를 추가하면 여기에 실시간 피드가 쌓입니다.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500">최근 알림 {feed.length}건</div>
        <button onClick={onClear} className="text-[11px] text-slate-400 hover:text-red-500">전체 삭제</button>
      </div>
      {feed.map((it) => (
        <FeedCard key={it.id} item={it} />
      ))}
    </div>
  );
}

function FeedCard({ item }: { item: KeypFeedItem }) {
  const credColor =
    item.credibility >= 85
      ? "text-emerald-600 bg-emerald-50"
      : item.credibility >= 65
        ? "text-amber-700 bg-amber-50"
        : "text-red-600 bg-red-50";
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${credColor}`}>
          <ShieldCheck className="h-3 w-3" />
          신뢰도 {item.credibility}%
        </span>
        <span className="text-[10px] text-slate-400">#{item.interest}</span>
      </div>
      <h3 className="text-sm font-bold leading-snug text-slate-900">{item.headline}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.summary}</p>

      {item.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.keywords.slice(0, 5).map((k) => (
            <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {item.sources.map((s, i) => {
          const style = platformStyle[s.platform] ?? platformStyle.other;
          return (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg p-1.5 text-[11px] transition hover:bg-slate-50"
            >
              <span className={`rounded px-1.5 py-0.5 font-semibold ${style.bg} ${style.text}`}>
                {style.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{s.title}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
            </a>
          );
        })}
      </div>
    </article>
  );
}

/* ─────────── Match ─────────── */
function MatchTab({ interests }: { interests: Interest[] }) {
  const matches = useMemo(() => {
    if (interests.length === 0) return [];
    const seed = interests.map((i) => i.label).join(",").length;
    const names = ["Jane.travel", "Min.dev", "Yuki.eats", "Alex.bts"];
    const cities = ["서울 · 20대", "부산 · 30대", "도쿄 · 20대", "뉴욕 · 30대"];
    return names.map((n, i) => ({
      id: `${i}`,
      name: n,
      city: cities[i],
      score: 70 + ((seed + i * 7) % 25),
      shared: interests.slice(0, 3).map((x) => x.label),
    }));
  }, [interests]);

  if (interests.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        관심사를 등록하면 비슷한 관심사를 가진 사용자를 매칭해드려요.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-5">
      <div className="text-xs font-semibold text-slate-500">비슷한 관심사를 가진 사용자</div>
      {matches.map((m) => (
        <div key={m.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
            매칭 점수 {m.score}%
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 font-bold text-white">
              {m.name[0]}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{m.name}</div>
              <div className="text-[11px] text-slate-500">{m.city}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {m.shared.map((s) => (
              <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
              연결 요청
            </button>
            <button className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              나중에
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// silence unused import warning for X icon (kept for future close buttons)
void X;
