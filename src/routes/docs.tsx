import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "KeyP API 문서 — Context Watch & 검색 API" },
      {
        name: "description",
        content:
          "KeyP API 문서: 자연어 관심사 감시(Context Watch) 생성, 실시간 기회 탐색, 검색 엔드포인트와 응답 형식, 인증 및 폴백 규칙.",
      },
      { property: "og:title", content: "KeyP API 문서 — Context Watch & 검색 API" },
      {
        property: "og:description",
        content:
          "Context Watch 생성, 실행, 스케줄러, 기회 탐색 엔드포인트의 요청·응답 예시와 엔진 상태 규칙을 정리한 개발자 문서.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://keyp.info/docs" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://keyp.info/docs" }],
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

        <Section title="🚀 KeyP × Daytona — Opportunity Agent">
          <p className="mb-3 text-sm text-slate-700">
            <b>KeyP doesn&apos;t just find opportunities. It executes the work required to pursue them.</b>
            <br />
            <span className="text-slate-500">From Interest to Action.</span>
          </p>
          <p className="mb-3 text-sm text-slate-700">
            KeyP Planner가 찾은 기회를 실제 <b>Daytona 샌드박스</b> 안에서 실행해 적격성 검증과 지원 서류 패키지를
            자동 생성합니다.
          </p>
          <Code>{`KeyP Planner / Verifier
        │  (기회 후보 + 신뢰도)
        ▼
Daytona Sandbox  (isolated, 서버에서만 생성)
        │  opportunity.json + company-profile.json + agent.py
        ▼
Requirements 추출 → Company Profile 비교 → Eligibility 판정
        ▼
Generated Application Package
  /output/eligibility-report.md
  /output/application-draft.md
  /output/submission-checklist.csv`}</Code>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">엔드포인트</h3>
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
            <tbody className="bg-white">
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-blue-600">GET</td>
                <td className="px-4 py-2 font-mono">/api/daytona/status</td>
                <td className="px-4 py-2 text-slate-600">{`{ configured: boolean }`}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-emerald-600">POST</td>
                <td className="px-4 py-2 font-mono">/api/daytona/run-opportunity</td>
                <td className="px-4 py-2 text-slate-600">샌드박스 실행 → 지원 패키지</td>
              </tr>
            </tbody>
          </table>
          <Code>{`// 요청
{
  "opportunity": { "id": "...", "title": "...", "category": "...", "deadline": "...",
                   "organizer": "...", "location": "...", "matchScore": 92,
                   "why": "...", "url": "https://..." },
  "companyProfile": { "company": "XrisP", "location": "Seoul",
                      "industry": "AI / Content / Education",
                      "companyType": "Startup / SME", "interests": ["AI grants"] },
  "demoMode": false
}

// 응답 (성공)
{ "ok": true, "mode": "real", "sandboxId": "…", "matchScore": 92,
  "eligible": "yes|review|no", "missingDocuments": [...],
  "steps": [...], "log": [...], "files": [{ "name": "...", "content": "..." }],
  "startedAt": "...", "finishedAt": "...", "elapsedMs": 12345 }

// 응답 (시크릿 미설정 — 절대 성공으로 위장하지 않음, HTTP 503)
{ "ok": false, "code": "not_configured", "error": "DAYTONA_API_KEY is not configured..." }`}</Code>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">필수 시크릿</h3>
          <p className="text-sm text-slate-700">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">DAYTONA_API_KEY</code> — Project
            Settings → Secrets 에 추가. 서버에서만 읽으며 브라우저에 절대 노출되지 않습니다. (선택:{" "}
            <code className="font-mono text-xs">DAYTONA_API_URL</code>,{" "}
            <code className="font-mono text-xs">DAYTONA_TARGET</code>,{" "}
            <code className="font-mono text-xs">DAYTONA_ORGANIZATION_ID</code>)
          </p>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">REAL vs DEMO</h3>
          <ul className="ml-5 list-disc space-y-1.5 text-sm text-slate-700">
            <li>
              <b>REAL RUN</b> — 시크릿이 설정된 경우에만. 실제 Daytona 샌드박스를 생성하고 그 안에서{" "}
              <code className="font-mono text-xs">python3 agent.py</code>를 실행한 뒤 샌드박스를 정리합니다. 응답에 실제
              sandbox id가 포함됩니다.
            </li>
            <li>
              <b>DEMO RUN</b> — <code className="font-mono text-xs">demoMode: true</code>로 명시적으로 요청할 때만
              동작하는 발표 백업용 시뮬레이션입니다. 샌드박스를 만들지 않고, UI·응답 모두 항상 DEMO로 표시됩니다.
            </li>
            <li>시크릿이 없으면 REAL 호출은 절대 가짜 성공을 반환하지 않고 <code className="font-mono text-xs">not_configured</code>를 반환합니다.</li>
          </ul>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">3분 데모 경로</h3>
          <p className="text-sm text-slate-700">
            Dashboard → Opportunities (샘플 1번 선택) → Run Opportunity Agent → Agent Runs 타임라인 → Results.
            대시보드 하단의 <b>데모 데이터 초기화</b> 버튼으로 샘플 3건과 실행 기록을 초기 상태로 되돌릴 수 있습니다.
          </p>
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            참고: 공식 <code className="font-mono">@daytonaio/sdk</code>는 Node 전용 의존성(opentelemetry sdk-node, tar,
            fast-glob, ws)으로 이 프로젝트의 엣지 서버 런타임에 번들되지 않습니다. 따라서 동일한 Daytona 클라우드 API를
            <code className="font-mono"> fetch</code>로 직접 호출하는 얇은 서버 클라이언트(
            <code className="font-mono">src/lib/daytona/client.server.ts</code>)를 사용합니다.
          </p>
        </Section>

        <Section title="🛰️ Context Watch — 의도 기반 24/7 감시">
          <p className="text-sm leading-relaxed text-slate-600">
            KeyP의 "관심사"는 키워드가 아니라 <b>자연어 의도 + 맥락(시간·장소·조건·부정조건)</b>입니다. 입력 문장을
            ContextPlan으로 구조화하고, 소스 전략에 따라 검색한 뒤, 근거를 직접 확인하고 조건 일치도를 판정합니다.
          </p>
          <Code>{`1. Intent & Context Reasoner (OpenAI Responses API, 기본 gpt-5.6-terra)
   · ambiguityScore가 높으면 gpt-5.6-sol로 1회 escalation
   · OPENAI_API_KEY 없으면 Lovable AI로 graceful fallback (UI에 fallback 표시)
2. Source Router — ContextPlan.sourceStrategy 우선순위대로
   · X/실시간 소셜 → Grok x_search + web_search
   · 공개 웹/공식 문서 → Gemini Google Search (없으면 Lovable AI 지식 = live search 아님)
   · 데이팅앱/로그인 뒤 개인정보/미성년자 → 접근하지 않음(차단 목록)
3. Direct verification — 후보 URL 실제 HTTP GET, 우회 없음, 실패는 "확인 필요"
4. Daytona — JS 렌더링·PDF·다중 링크가 필요할 때만 on-demand 생성 후 즉시 destroy
5. Evidence-based Match Judge — matchScore / matchedConstraints /
   missingConstraints / contradiction / whyMatched / confidence
6. 알림 기준 미달 결과는 저장·알림하지 않고 "참고용"으로만 표시`}</Code>
          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">엔드포인트 & 저장소</h3>
          <Code>{`POST /api/watches           자연어 → ContextPlan → DB 저장
GET  /api/watches           watch 목록 + findings
POST /api/watches/:id/run   즉시 실행
POST /api/scheduler/tick    next_run_at <= now() 인 watch를 제한 개수 처리
GET  /api/research/status   엔진 configured boolean + 모델명 (키 값 반환 없음)

DB: context_watches · watch_runs · findings · source_evidence · notification_queue
24/7의 source of truth는 next_run_at. claim_due_watches()가 FOR UPDATE SKIP LOCKED로
행을 선점하므로 tick이 겹쳐도 같은 watch가 중복 실행되지 않습니다.`}</Code>
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
            공개 소스 전용(privacyMode: public_only). 비공개 프로필·로그인/CAPTCHA/robots 우회·미성년자·비공개
            개인정보·사진이나 이름 기반 속성 추론은 하지 않습니다. 개인 관련 결과는 본인의 공개 자기진술과 공개 출처
            URL이 있을 때만 표시합니다. 현재 앱 로그인 기능이 없어 DB 쓰기는 서버 라우트에서만 수행합니다 —
            TODO(auth): 로그인 도입 시 owner_id 기반 RLS 정책 추가.
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
            TODO(deploy): 배포 후 <code className="font-mono">/api/scheduler/tick</code>을 15분 주기 cron(pg_cron +
            pg_net 또는 외부 스케줄러)으로 호출하면 24/7 감시가 완성됩니다. 프리뷰 URL은 하드코딩하지 않았습니다.
          </p>
        </Section>


        <Section title="🔎 Multi-Source Research Agent (Gemini + Grok + Daytona)">
          <Code>{`1. Lovable UI / KeyP orchestration
2. Daytona isolated research runtime (모든 수집·검증이 샌드박스 안에서 실행)
3. Gemini — Google Search grounding (공식 출처 우선)
4. Grok — web_search + x_search (X/트위터 발표·커뮤니티 신호)
5. Direct source verification — 후보 URL에 실제 HTTP GET (status/final URL/title/snippet)
6. Evidence fusion — 중복 제거, 출처 등급, 신뢰도 산정
7. Application package generation — eligibility + 지원 서류 초안`}</Code>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">엔드포인트</h3>
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
            <tbody className="bg-white">
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-blue-600">GET</td>
                <td className="px-4 py-2 font-mono">/api/research/status</td>
                <td className="px-4 py-2 text-slate-600">
                  {`{daytonaConfigured, geminiConfigured, grokConfigured, lovableAiAvailable, geminiModel, grokModel}`}
                </td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-emerald-600">POST</td>
                <td className="px-4 py-2 font-mono">/api/research/opportunities</td>
                <td className="px-4 py-2 text-slate-600">라이브 리서치 → 검증된 기회 목록</td>
              </tr>
            </tbody>
          </table>
          <Code>{`// 요청
{ "query": "서울 AI 스타트업 정부지원사업/해커톤", "companyProfile": { ... }, "maxResults": 8 }

// 응답 (성공)
{ "ok": true, "sandboxId": "…", "enginesUsed": ["gemini","grok"], "query": "…",
  "results": [{ "id": "...", "title": "...", "deadline": "공식 공고 확인 필요",
                "url": "https://...", "sample": false,
                "discoveredBy": ["gemini"], "sourceType": "official",
                "sourceEvidence": [{ "engine": "gemini", "url": "...", "statusCode": 200, "snippet": "..." }],
                "xEvidence": [...], "verified": true, "confidence": 84 }],
  "logs": [...], "engineErrors": [...], "elapsedMs": 41234 }

// 응답 (Daytona 미설정 — 가짜 라이브 결과 없음, HTTP 503)
{ "ok": false, "code": "not_configured", "error": "DAYTONA_API_KEY is not configured..." }`}</Code>

          <h3 className="mt-5 mb-2 text-sm font-bold text-slate-900">시크릿</h3>
          <ul className="ml-5 list-disc space-y-1.5 text-sm text-slate-700">
            <li>
              <code className="font-mono text-xs">DAYTONA_API_KEY</code> — <b>필수</b>. 라이브 샌드박스 리서치/실행.
            </li>
            <li>
              <code className="font-mono text-xs">GEMINI_API_KEY</code> — 권장. Google Search 그라운딩 기반 라이브 웹
              리서치 (<code className="font-mono text-xs">GEMINI_MODEL</code> 기본 gemini-2.5-flash).
            </li>
            <li>
              <code className="font-mono text-xs">XAI_API_KEY</code> — 선택(권장). Grok x_search + web_search (
              <code className="font-mono text-xs">GROK_MODEL</code> 기본 grok-4.6).
            </li>
          </ul>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <b>Cursor 크레딧 안내</b> — Cursor의 Grok 크레딧은 Cursor 안에서만 적용되며, 배포된 이 KeyP 앱의{" "}
            <code className="font-mono">XAI_API_KEY</code> 결제로 사용할 수 없습니다. Grok X Search를 켜려면 xAI API
            키를 <code className="font-mono">XAI_API_KEY</code>로 추가하세요.
          </p>
          <ul className="mt-3 ml-5 list-disc space-y-1.5 text-sm text-slate-700">
            <li>GEMINI_API_KEY 미설정 시: 직접 Google Search 그라운딩 없음 — 추론/요약 폴백만 사용하며 라이브 검색이 일어난 것처럼 표기하지 않습니다.</li>
            <li>XAI_API_KEY 미설정 시: X 결과를 생성하지 않고 상태를 “연결 필요”로 표시합니다.</li>
            <li>마감일은 절대 추정하지 않습니다 — 근거가 없으면 “공식 공고 확인 필요”로 남습니다.</li>
            <li>소셜 근거만 있는 항목은 Needs verification으로 표시되며 official 사실을 덮어쓰지 않습니다.</li>
          </ul>
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
