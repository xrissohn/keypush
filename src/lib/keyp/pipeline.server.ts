// KeyP AI pipeline — Planner → (per-platform Collector→Verifier) → Deliverer.
// Runs server-side only. Uses Lovable AI Gateway (OpenAI-compatible).
import type {
  KeypFeedItem,
  KeypSearchRequest,
  KeypSearchResponse,
  SnsPlatform,
} from "./types";
import { callJsonAI, toFeedItems, verifyDrafts, type DraftItem } from "./collectors/base.server";
import {
  getPlatformSpec,
  runPlatformCollector,
  specializedPlatforms,
} from "./collectors/index.server";

// 1) PLANNER — interpret user's natural-language interest into search intent.
async function planner(interest: string, language = "ko") {
  const out = await callJsonAI<{
    intent: string;
    queries: string[];
    targetPlatforms: string[];
  }>({
    system:
      "당신은 KeyP의 Planner 에이전트입니다. 사용자가 자연어로 입력한 관심사를 " +
      "여러 SNS 플랫폼에서 검색 가능한 형태로 구조화합니다. 반드시 JSON만 출력.",
    user:
      `사용자 관심사: "${interest}"\n언어: ${language}\n` +
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
  });

  return {
    intent: out.intent,
    queries: out.queries.slice(0, 5),
    targetPlatforms: (out.targetPlatforms as SnsPlatform[]).slice(0, 4),
  };
}

// Generic collector for platforms without a dedicated module (x, tiktok, reddit, news, ...).
async function genericCollect(
  interest: string,
  platform: SnsPlatform,
  queries: string[],
  perPlatform: number,
  language: string,
): Promise<KeypFeedItem[]> {
  const out = await callJsonAI<{ items: DraftItem[] }>({
    system:
      `당신은 KeyP의 ${platform} 일반 Collector입니다. ` +
      "환각 방지: 개별 게시물 URL을 만들지 말고 플랫폼 검색 URL을 사용. JSON만 출력.",
    user:
      `관심사: "${interest}"\n언어: ${language}\n생성 개수: ${perPlatform}\n쿼리: ${queries.join(" | ")}`,
    schemaName: `keyp_${platform}_generic`,
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
              rawConfidence: { type: "number" },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    author: { type: "string" },
                    publishedAt: { type: "string" },
                  },
                  required: ["url", "title"],
                },
              },
            },
            required: ["headline", "summary", "keywords", "rawConfidence", "sources"],
          },
        },
      },
      required: ["items"],
    },
  });
  const drafts = (out.items ?? []).slice(0, perPlatform);
  const verified = await verifyDrafts(interest, platform, drafts);
  return toFeedItems(interest, platform, verified);
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

  // Distribute the requested total across platforms (min 1 each).
  const platforms = plan.targetPlatforms.length ? plan.targetPlatforms : ["news" as SnsPlatform];
  const perPlatform = Math.max(1, Math.ceil(limit / platforms.length));

  // Run every platform collector in parallel.
  const specialized = new Set(specializedPlatforms());
  const results = await Promise.all(
    platforms.map(async (p) => {
      try {
        if (specialized.has(p) && getPlatformSpec(p)) {
          return await runPlatformCollector({
            platform: p,
            interest,
            queries: plan.queries,
            limit: perPlatform,
            language,
          });
        }
        return await genericCollect(interest, p, plan.queries, perPlatform, language);
      } catch (e) {
        console.error(`[keyp] collector ${p} failed`, e);
        return [] as KeypFeedItem[];
      }
    }),
  );

  // Merge, sort by credibility, cap to limit.
  const items = results
    .flat()
    .sort((a, b) => b.credibility - a.credibility)
    .slice(0, limit);

  return {
    ok: true,
    interest,
    plan,
    items,
    generatedAt: new Date().toISOString(),
  };
}
