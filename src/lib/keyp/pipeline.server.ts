// KeyP AI pipeline — Planner → Collector → Verifier → Deliverer.
// Runs server-side only. Uses Lovable AI Gateway (OpenAI-compatible).
import type {
  KeypFeedItem,
  KeypSearchRequest,
  KeypSearchResponse,
  SnsPlatform,
} from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function requireKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

async function callAI(opts: {
  system: string;
  user: string;
  jsonSchema: unknown;
  schemaName: string;
}) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": requireKey(),
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.schemaName,
          strict: false,
          schema: opts.jsonSchema,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw);
  } catch {
    // salvage json block
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

// 1) PLANNER — interpret user's natural-language interest into search intent
async function planner(interest: string, language = "ko") {
  const out = (await callAI({
    system:
      "당신은 KeyP의 Planner 에이전트입니다. 사용자가 자연어로 입력한 관심사를 " +
      "여러 SNS 플랫폼에서 검색 가능한 형태로 구조화합니다. 반드시 JSON만 출력.",
    user: `사용자 관심사: "${interest}"\n언어: ${language}\n` +
      "1) 사용자의 실제 검색 의도(intent)를 한 문장으로 요약\n" +
      "2) 다양한 SNS에 던질 검색 쿼리 3~5개(구체적 키워드)\n" +
      "3) 이 관심사에 가장 적합한 SNS 플랫폼 2~4개 선택\n" +
      "(youtube, instagram, facebook, linkedin, x, tiktok, reddit, news, blog, community, other 중에서)",
    schemaName: "keyp_plan",
    jsonSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        queries: { type: "array", items: { type: "string" } },
        targetPlatforms: { type: "array", items: { type: "string" } },
      },
      required: ["intent", "queries", "targetPlatforms"],
    },
  })) as { intent: string; queries: string[]; targetPlatforms: string[] };

  return {
    intent: out.intent,
    queries: out.queries.slice(0, 5),
    targetPlatforms: (out.targetPlatforms as SnsPlatform[]).slice(0, 4),
  };
}

// 2+3+4) COLLECTOR + VERIFIER + DELIVERER — combined for speed.
// The AI, using its training knowledge, drafts realistic feed items across
// the target SNS platforms, cross-checks its own claims, assigns credibility.
// (When a Firecrawl / SNS connector is added, swap this for a real fetch step.)
async function collectVerifyDeliver(
  interest: string,
  plan: { intent: string; queries: string[]; targetPlatforms: SnsPlatform[] },
  limit: number,
  language: string,
) {
  const out = (await callAI({
    system:
      "당신은 KeyP의 Collector+Verifier+Deliverer 통합 에이전트입니다. " +
      "타겟 SNS 플랫폼들에서 사용자 관심사에 관한 최신·유망 정보 조각을 수집한다고 가정하고, " +
      "각 항목에 대해 교차검증한 신뢰도(0-100)와 요약을 생성합니다. " +
      "환각 방지를 위해: 확실하지 않으면 신뢰도를 낮추고, sources.url은 각 플랫폼의 " +
      "실존 도메인 검색 URL(예: https://www.youtube.com/results?search_query=...)을 사용. " +
      "가짜 개별 게시물 URL은 만들지 말 것. 반드시 JSON만 출력.",
    user:
      `관심사: "${interest}"\n` +
      `의도: ${plan.intent}\n` +
      `검색 쿼리: ${plan.queries.join(" | ")}\n` +
      `대상 플랫폼: ${plan.targetPlatforms.join(", ")}\n` +
      `언어: ${language}\n` +
      `생성할 피드 항목 수: ${limit}\n\n` +
      "각 항목은 서로 다른 각도/플랫폼에서 나온 것처럼 구성하세요.",
    schemaName: "keyp_feed",
    jsonSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              headline: { type: "string" },
              summary: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              credibility: { type: "number" },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    platform: { type: "string" },
                    url: { type: "string" },
                    title: { type: "string" },
                    author: { type: "string" },
                    publishedAt: { type: "string" },
                  },
                  required: ["platform", "url", "title"],
                },
              },
            },
            required: ["headline", "summary", "keywords", "credibility", "sources"],
          },
        },
      },
      required: ["items"],
    },
  })) as { items: Array<Omit<KeypFeedItem, "id" | "interest" | "createdAt">> };

  const now = new Date().toISOString();
  const items: KeypFeedItem[] = out.items.slice(0, limit).map((it, i) => ({
    id: `${Date.now()}-${i}`,
    interest,
    createdAt: now,
    ...it,
    credibility: Math.max(0, Math.min(100, Math.round(it.credibility))),
    sources: it.sources.map((s) => ({
      ...s,
      platform: (s.platform as SnsPlatform) ?? "other",
    })),
  }));
  return items;
}

export async function runKeypPipeline(
  req: KeypSearchRequest,
): Promise<KeypSearchResponse> {
  const interest = req.interest?.trim();
  if (!interest) throw new Error("interest is required");
  const limit = Math.min(Math.max(req.limit ?? 5, 1), 10);
  const language = req.language ?? "ko";

  const plan = await planner(interest, language);
  if (req.platforms?.length) plan.targetPlatforms = req.platforms;

  const items = await collectVerifyDeliver(interest, plan, limit, language);

  return {
    ok: true,
    interest,
    plan,
    items,
    generatedAt: new Date().toISOString(),
  };
}
