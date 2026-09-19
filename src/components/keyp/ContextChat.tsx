import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, ExternalLink, Menu, MoreHorizontal, Pause, Play, Plus, Send, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import keypLogo from "@/assets/keyp-logo.svg";
import type { ContextFinding, ContextWatch, CreateWatchResult, WatchNotification } from "@/lib/context/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const EXAMPLES = [
  "서울에서 다음주 마감하는 AI 스타트업 지원사업",
  "뉴욕에서 한국 남성과 데이트하고 싶다고 공개적으로 밝힌 성인 여성이 있으면 알려줘",
];

type WatchThread = ContextWatch & { findings: ContextFinding[] };

type NotificationsResponse = { ok: true; notifications: WatchNotification[] } | { ok: false; error: string };

async function fetchWatches() {
  const response = await fetch("/api/watches");
  const json = (await response.json()) as { ok: boolean; watches?: WatchThread[]; error?: string };
  if (!json.ok) throw new Error(json.error ?? "알림 목록을 불러오지 못했어요.");
  return json.watches ?? [];
}

async function fetchNotifications() {
  const response = await fetch("/api/notifications");
  const json = (await response.json()) as NotificationsResponse;
  if (!json.ok) throw new Error(json.error);
  return json.notifications;
}

export function ContextChat() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingText, setCreatingText] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const knownNotifications = useRef<Set<string> | null>(null);
  const watches = useQuery({ queryKey: ["watches"], queryFn: fetchWatches, refetchInterval: 30_000 });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, refetchInterval: 15_000 });

  const selected = watches.data?.find((watch) => watch.id === selectedId) ?? watches.data?.[0] ?? null;

  useEffect(() => {
    if (!selectedId && watches.data?.[0]) setSelectedId(watches.data[0].id);
  }, [selectedId, watches.data]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const watchId = params.get("watch");
    const findingId = params.get("finding");
    if (watchId) setSelectedId(watchId);
    if (findingId) window.setTimeout(() => document.getElementById(`finding-${findingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
  }, []);

  useEffect(() => {
    if (!notifications.data) return;
    if (!knownNotifications.current) {
      knownNotifications.current = new Set(notifications.data.map((item) => item.id));
      return;
    }
    for (const item of notifications.data) {
      if (knownNotifications.current.has(item.id)) continue;
      knownNotifications.current.add(item.id);
      toast("새 정보를 찾았어요", { description: item.title });
      if (Notification.permission === "granted") {
        const notice = new Notification("KeyP가 새 정보를 찾았어요", { body: item.title, icon: "/favicon.png", tag: item.id });
        notice.onclick = () => {
          window.focus();
          window.location.href = `/?watch=${item.watchId}&finding=${item.findingId}`;
        };
      }
    }
  }, [notifications.data]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  const create = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = (await response.json()) as CreateWatchResult | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      return json;
    },
    onMutate: (query) => setCreatingText(query),
    onSuccess: async (result) => {
      setDraft("");
      setSelectedId(result.watch.id);
      await queryClient.invalidateQueries({ queryKey: ["watches"] });
    },
    onError: (error: Error) => toast.error("알림을 등록하지 못했어요", { description: error.message }),
    onSettled: () => setCreatingText(null),
  });

  async function updateWatch(id: string, patch: { active?: boolean; refreshMinutes?: number }) {
    const response = await fetch(`/api/watches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error("설정을 저장하지 못했어요.");
    await queryClient.invalidateQueries({ queryKey: ["watches"] });
  }

  async function removeWatch(id: string) {
    if (!window.confirm("이 알림과 대화 기록을 삭제할까요?")) return;
    const response = await fetch(`/api/watches/${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("알림을 삭제하지 못했어요.");
    setSelectedId(null);
    await queryClient.invalidateQueries({ queryKey: ["watches"] });
  }

  const unread = notifications.data?.filter((item) => item.status !== "read") ?? [];
  const submit = () => {
    const query = draft.trim();
    if (query.length >= 4 && !create.isPending) create.mutate(query);
  };

  const sidebar = (
    <WatchSidebar
      watches={watches.data ?? []}
      selectedId={selected?.id ?? null}
      onNew={() => {
        setSelectedId(null);
        setMobileOpen(false);
      }}
      onSelect={(id) => {
        setSelectedId(id);
        setMobileOpen(false);
      }}
      onToggle={(watch) => void updateWatch(watch.id, { active: !watch.active })}
      onDelete={(id) => void removeWatch(id)}
    />
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2 lg:hidden" aria-label="알림 목록 열기">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[86vw] max-w-xs p-0">
              <SheetHeader className="sr-only"><SheetTitle>내 알림</SheetTitle></SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2" aria-label="KeyP 홈">
            <img src={keypLogo} alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold">KeyP</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell items={notifications.data ?? []} unread={unread.length} onRead={async () => {
              if (!unread.length) return;
              await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: unread.map((item) => item.id) }) });
              await queryClient.invalidateQueries({ queryKey: ["notifications"] });
            }} onSelect={(item) => setSelectedId(item.watchId)} />
            <Popover>
              <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="설정"><Settings /></Button></PopoverTrigger>
              <PopoverContent align="end" className="w-72 rounded-2xl">
                <p className="font-semibold">알림 설정</p>
                <p className="mt-1 text-sm text-muted-foreground">브라우저 알림은 이 기기에서만 표시됩니다.</p>
                <Button variant="outline" className="mt-4 w-full" onClick={() => void requestNotifications()}>
                  <BellRing /> 브라우저 알림 허용
                </Button>
                <Button variant="ghost" className="mt-1 w-full" asChild><Link to="/opportunities">기회 탐색 도구</Link></Button>
                <Button variant="ghost" className="w-full" asChild><Link to="/docs">서비스 상세</Link></Button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="flex-1">
          {!selected && !creatingText ? (
            <EmptyState draft={draft} setDraft={setDraft} submit={submit} pending={create.isPending} />
          ) : (
            <Thread watch={selected} creatingText={creatingText} />
          )}
        </main>

        {(selected || creatingText) && (
          <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur">
            <Composer draft={draft} setDraft={setDraft} submit={submit} pending={create.isPending} compact />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ draft, setDraft, submit, pending }: { draft: string; setDraft: (value: string) => void; submit: () => void; pending: boolean }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[760px] flex-col items-center justify-center px-5 py-16">
      <img src={keypLogo} alt="" className="h-14 w-14 rounded-2xl" />
      <h1 className="mt-6 text-center text-3xl font-semibold leading-tight sm:text-4xl">무엇을 찾아드릴까요?</h1>
      <p className="mt-3 text-center text-base text-muted-foreground">한 문장으로 알려주시면, 새 정보가 생길 때만 알려드려요.</p>
      <div className="mt-9 w-full"><Composer draft={draft} setDraft={setDraft} submit={submit} pending={pending} /></div>
      <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
        {EXAMPLES.map((example) => (
          <Button key={example} variant="outline" className="h-auto flex-1 whitespace-normal rounded-2xl px-4 py-3 text-left text-sm font-normal text-muted-foreground" onClick={() => setDraft(example)}>{example}</Button>
        ))}
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, submit, pending, compact = false }: { draft: string; setDraft: (value: string) => void; submit: () => void; pending: boolean; compact?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] items-end gap-2 rounded-2xl border border-input bg-card p-2">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
        }}
        rows={compact ? 1 : 3}
        placeholder="찾고 싶은 내용을 자연어로 입력하세요"
        aria-label="무엇을 찾아드릴까요?"
        className="min-h-11 resize-none border-0 px-3 py-3 text-[15px] shadow-none focus-visible:ring-0"
      />
      <Button size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90" onClick={submit} disabled={pending || draft.trim().length < 4} aria-label="알림 받기">
        <Send />
      </Button>
    </div>
  );
}

function Thread({ watch, creatingText }: { watch: WatchThread | null; creatingText: string | null }) {
  const query = watch?.rawQuery ?? creatingText ?? "";
  const baseline = watch?.findings.find((finding) => finding.isBaseline);
  const updates = watch?.findings.filter((finding) => !finding.isBaseline) ?? [];
  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <DateDivider date={watch?.createdAt} />
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-3 text-[15px] leading-relaxed">{query}</div>
      <div className="mt-7 flex items-start gap-3">
        <img src={keypLogo} alt="KeyP" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          {creatingText ? (
            <p className="pt-1 text-[15px] text-muted-foreground">등록하고 가장 가까운 최근 정보를 찾고 있어요…</p>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed">등록했어요. {baseline ? "가장 가까운 최근 정보를 먼저 찾았어요." : "아직 확인된 정보가 없어요. 새 정보가 생기면 알려드릴게요."}</p>
              {baseline && <div className="mt-3"><FindingCard finding={baseline} baseline /></div>}
              <p className="mt-3 text-sm text-muted-foreground">새 정보가 생기면 알려드릴게요 · {watch?.active ? "계속 확인 중" : "일시정지됨"}</p>
            </>
          )}
        </div>
      </div>
      {updates.map((finding) => (
        <div id={`finding-${finding.id}`} key={finding.id ?? finding.dedupeKey} className="mt-10 flex items-start gap-3">
          <img src={keypLogo} alt="KeyP" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2 text-[15px] font-medium">새로 찾았어요 <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">NEW</span></div>
            <FindingCard finding={finding} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FindingCard({ finding, baseline = false }: { finding: ContextFinding; baseline?: boolean }) {
  const host = safeHost(finding.canonicalUrl ?? finding.sourceUrl);
  const time = relativeTime(finding.publishedAt ?? finding.firstSeenAt);
  return (
    <article className="rounded-2xl border border-border bg-card p-4" aria-label={finding.title}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted font-semibold text-foreground">{host.slice(0, 1).toUpperCase()}</span>
        <span className="font-medium text-foreground">{host}</span><span>·</span><span>{time}</span>
        <span className="ml-auto rounded-full bg-brand-soft px-2 py-1 font-semibold text-brand">{finding.matchScore}% match</span>
      </div>
      <div className="mt-3 text-xs font-medium text-muted-foreground">{baseline ? "최근 참고 정보" : "새 정보"}</div>
      <h2 className="mt-1 text-base font-semibold leading-snug">{finding.title}</h2>
      {finding.summary && <p className="mt-2 line-clamp-3 text-[15px] leading-6 text-muted-foreground">{finding.summary}</p>}
      {finding.whyMatched && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-brand">왜 매칭됐나요?</summary><p className="mt-2 leading-6 text-muted-foreground">{finding.whyMatched}</p></details>}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{finding.sourceType}</span>
        {finding.verified && <span className="rounded-full bg-success-soft px-2 py-1 text-xs text-success">확인됨</span>}
        <a href={finding.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">원문 보기 <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
    </article>
  );
}

function WatchSidebar({ watches, selectedId, onNew, onSelect, onToggle, onDelete }: { watches: WatchThread[]; selectedId: string | null; onNew: () => void; onSelect: (id: string) => void; onToggle: (watch: WatchThread) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex h-13 items-center gap-2 px-2"><img src={keypLogo} alt="" className="h-8 w-8 rounded-lg" /><span className="font-semibold">KeyP</span></div>
      <Button variant="outline" className="mt-3 w-full justify-start rounded-xl" onClick={onNew}><Plus /> 새 알림</Button>
      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto" aria-label="활성 알림">
        {watches.map((watch) => (
          <div key={watch.id} className={`group flex items-center rounded-xl ${selectedId === watch.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}>
            <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-3 py-3 text-left" onClick={() => onSelect(watch.id)}>
              <span className={`mr-2 h-2 w-2 shrink-0 rounded-full ${watch.active ? "bg-brand" : "bg-muted-foreground/30"}`} />
              <span className="line-clamp-2 text-sm leading-5">{watch.rawQuery}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 h-8 w-8 opacity-70" aria-label="알림 메뉴"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onToggle(watch)}>{watch.active ? <Pause /> : <Play />}{watch.active ? "일시정지" : "다시 시작"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(watch.id)}><Trash2 />삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </nav>
      <Button variant="ghost" className="justify-start" asChild><Link to="/opportunities">기회 탐색 도구</Link></Button>
    </div>
  );
}

function NotificationBell({ items, unread, onRead, onSelect }: { items: WatchNotification[]; unread: number; onRead: () => Promise<void>; onSelect: (item: WatchNotification) => void }) {
  return (
    <Popover onOpenChange={(open) => { if (open) void onRead(); }}>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={`알림 ${unread}개`}><Bell />{unread > 0 && <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">{Math.min(unread, 99)}</span>}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] rounded-2xl p-2">
        <div className="px-2 py-2 font-semibold">알림</div>
        {items.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">아직 새 알림이 없어요.</p> : items.slice(0, 10).map((item) => <Button key={item.id} variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-xl px-3 py-3 text-left" onClick={() => onSelect(item)}><div><p className="line-clamp-2 text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.matchScore}% match · {relativeTime(item.createdAt)}</p></div></Button>)}
      </PopoverContent>
    </Popover>
  );
}

function DateDivider({ date }: { date?: string }) {
  return <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{dayLabel(date)}</span><span className="h-px flex-1 bg-border" /></div>;
}

function dayLabel(value?: string) {
  if (!value) return "Today";
  const date = new Date(value); const today = new Date();
  const delta = Math.floor((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function relativeTime(value?: string | null) {
  if (!value) return "게시 시각 미확인";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}

function safeHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "출처"; }
}

async function requestNotifications() {
  if (!("Notification" in window)) return toast.error("이 브라우저는 알림을 지원하지 않아요.");
  const permission = await Notification.requestPermission();
  if (permission === "granted") toast.success("브라우저 알림을 켰어요.");
  else toast("브라우저 알림이 꺼져 있어요.");
}
