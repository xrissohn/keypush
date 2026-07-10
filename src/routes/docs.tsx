import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "KeyP API 문서 — 팀 공유용" },
      { name: "description", content: "KeyP 실시간 관심사 알림 API 사용법." },
    ],
  }),
  component: DocsPage,
});

const CURL = `curl -X POST https://<your-domain>/api/public/keyp/search \\
  -H "Content-Type: application/json" \\
  -d '{"interest":"BTS 월드투어 일정","limit":5,"language":"ko"}'`;

const TS = `import { keypClient } from "@/lib/keyp/client";

const res = await keypClient.search({
  interest: "AI 스타트업 투자 기회",
  platforms: ["linkedin", "news", "x"],
  limit: 5,
});

if (res.ok) {
  for (const item of res.items) {
    console.log(item.headline, item.credibility, item.sources);
  }
}`;

const RESP = `{
  "ok": true,
  "interest": "BTS 월드투어 일정",
  "plan": {
    "intent": "BTS 월드투어 관련 최신 공식/팬 정보 수집",
    "queries": ["BTS world tour 2025", "BTS 콘서트 일정", ...],
    "targetPlatforms": ["youtube", "x", "news", "instagram"]
  },
  "items": [
    {
      "id": "1720000000000-0",
      "interest": "BTS 월드투어 일정",
      "headline": "BTS 월드투어 앙코르 발표",
      "summary": "2025년 추가 공연 일정과 예매 정보 요약...",
      "keywords": ["BTS", "월드투어", "앙코르"],
      "credibility": 88,
      "sources": [
        { "platform": "youtube", "url": "https://www.youtube.com/results?search_query=BTS+world+tour", "title": "관련 영상" },
        { "platform": "news", "url": "https://news.google.com/search?q=BTS+world+tour", "title": "관련 뉴스" }
      ],
      "createdAt": "2026-07-10T09:00:00.000Z"
    }
  ],
  "generatedAt": "2026-07-10T09:00:00.000Z"
}`;

function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-600 text-lg font-black text-white">K</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-indigo-600">KeyP API</div>
            <h1 className="text-2xl font-bold text-slate-900">팀 공유용 API 문서</h1>
          </div>
        </div>

        <p className="mb-8 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
          KeyP의 <b>Planner → Collector → Verifier → Deliverer</b> 파이프라인을 단일 HTTP 엔드포인트로 노출합니다.
          다른 팀원은 이 API 하나만 호출하면 관심사에 대한 SNS 기반 실시간 피드를 받을 수 있어요.
        </p>

        <Section title="🔌 엔드포인트">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Path</th>
                <th className="px-4 py-2">설명</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-emerald-600">POST</td>
                <td className="px-4 py-2 font-mono">/api/public/keyp/search</td>
                <td className="px-4 py-2 text-slate-600">관심사 → AI 분석 → SNS 피드</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-blue-600">GET</td>
                <td className="px-4 py-2 font-mono">/api/public/keyp/search?interest=…</td>
                <td className="px-4 py-2 text-slate-600">간단 조회용 (동일 결과)</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">CORS 개방 · 인증 불필요 (해커톤 MVP)</p>
        </Section>

        <Section title="📥 요청 본문">
          <Code>{`{
  "interest": "string (필수)",     // 자연어 관심사
  "limit":    "number (1~10, 기본 5)",
  "language": "string (기본 'ko')",
  "platforms": ["youtube"|"instagram"|"facebook"|"linkedin"|"x"|"tiktok"|"reddit"|"news"|"blog"|"community"]
}`}</Code>
        </Section>

        <Section title="🧪 cURL 예제">
          <Code>{CURL}</Code>
        </Section>

        <Section title="📘 TypeScript 클라이언트">
          <p className="mb-2 text-xs text-slate-500">
            <code>src/lib/keyp/client.ts</code> — 그대로 복사해서 다른 프로젝트에서도 사용 가능.
          </p>
          <Code>{TS}</Code>
        </Section>

        <Section title="📤 응답 예시">
          <Code>{RESP}</Code>
        </Section>

        <Section title="⚙️ 내부 파이프라인">
          <ol className="ml-5 list-decimal space-y-2 text-sm text-slate-700">
            <li><b>Planner</b> — 자연어 관심사를 의도(intent) + 검색쿼리 3~5개 + 타겟 SNS 2~4개로 구조화.</li>
            <li><b>Collector</b> — 타겟 SNS(YouTube / Instagram / Facebook / LinkedIn / X / TikTok / Reddit / 뉴스 / 블로그 / 커뮤니티)에서 후보 정보 수집.</li>
            <li><b>Verifier</b> — 여러 소스 교차검증 후 신뢰도(0~100) 부여.</li>
            <li><b>Deliverer</b> — 요약·중복 제거 후 푸시 가능한 피드 카드로 정제.</li>
          </ol>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            현재 Collector는 Lovable AI Gateway(Gemini) 지식을 기반으로 후보를 생성합니다.
            실제 실시간 스크래핑이 필요하면 Firecrawl 커넥터를 붙여 <code>collectVerifyDeliver</code> 함수 안의 수집 단계를 교체하세요.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}
