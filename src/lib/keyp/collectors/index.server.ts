// Per-platform collector factory. Each platform gets its own system prompt
// with platform-specific source URL patterns, tone, and verification biases.
// The pipeline runs these in parallel and merges results.
import type { KeypFeedItem, SnsPlatform } from "../types";
import { callJsonAI, toFeedItems, verifyDrafts, type DraftItem } from "./base.server";

interface PlatformSpec {
  platform: SnsPlatform;
  displayName: string;
  // Guidance the AI uses when drafting items for this platform.
  personaPrompt: string;
  // Real search-URL template so we never fabricate individual post URLs.
  searchUrl: (q: string) => string;
  // Extra verification hints (e.g. "linkedin은 익명 계정 신뢰도 하향").
  verifierHint?: string;
}

const SPECS: Record<string, PlatformSpec> = {
  youtube: {
    platform: "youtube",
    displayName: "YouTube",
    personaPrompt:
      "YouTube 큐레이터. 최신 영상/채널/쇼츠 트렌드 관점으로 서술. " +
      "구독자 규모, 조회수 흐름, 공식 채널 vs UGC 구분을 반영하세요.",
    searchUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    verifierHint:
      "공식 아티스트/브랜드 채널이면 신뢰도 +10, 클릭베이트성 제목은 -15.",
  },
  instagram: {
    platform: "instagram",
    displayName: "Instagram",
    personaPrompt:
      "Instagram 트렌드 분석가. 릴스/스토리/해시태그 중심으로 서술. " +
      "인플루언서·브랜드 계정과 UGC를 구분하고, 시각적 트렌드 키워드를 포함하세요.",
    searchUrl: (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/\s+/g, ""))}/`,
    verifierHint: "인증(파란체크) 계정이면 +10, 사설 마케팅 계정이면 -10.",
  },
  facebook: {
    platform: "facebook",
    displayName: "Facebook",
    personaPrompt:
      "Facebook 커뮤니티/페이지 분석가. 공식 페이지, 지역 그룹, 이벤트 관점으로 서술. " +
      "공유수·반응 흐름을 반영하세요.",
    searchUrl: (q) => `https://www.facebook.com/search/top?q=${encodeURIComponent(q)}`,
    verifierHint: "공식 페이지/이벤트면 +10, 스팸성 그룹 게시물은 -20.",
  },
  linkedin: {
    platform: "linkedin",
    displayName: "LinkedIn",
    personaPrompt:
      "LinkedIn 산업/인재 애널리스트. 기업 공지, 임원 인사이트, 채용/투자 신호 위주로 서술. " +
      "출처는 회사 공식 페이지 또는 임원 프로필 관점을 우선하세요.",
    searchUrl: (q) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}`,
    verifierHint: "기업 공식 페이지·임원 명의 게시물이면 +15, 익명/신규 계정은 -15.",
  },
};

export function getPlatformSpec(p: SnsPlatform): PlatformSpec | undefined {
  return SPECS[p];
}

export function specializedPlatforms(): SnsPlatform[] {
  return Object.keys(SPECS) as SnsPlatform[];
}

// Drafting step for one platform (collect).
async function draftForPlatform(
  spec: PlatformSpec,
  interest: string,
  queries: string[],
  limit: number,
  language: string,
): Promise<DraftItem[]> {
  const out = await callJsonAI<{ items: DraftItem[] }>({
    system:
      `당신은 KeyP의 ${spec.displayName} 전용 Collector입니다. ${spec.personaPrompt} ` +
      "환각 방지 규칙: 개별 게시물 URL을 만들지 말고, 반드시 아래 검색결과 URL 형식만 사용. " +
      "확실치 않으면 rawConfidence를 낮추세요(0-100). JSON만 출력.",
    user:
      `관심사: "${interest}"\n언어: ${language}\n생성 개수: ${limit}\n` +
      `사용할 검색 쿼리: ${queries.join(" | ")}\n` +
      `허용된 검색 URL 예시: ${spec.searchUrl(queries[0] ?? interest)}\n` +
      `모든 sources.url은 ${spec.displayName}의 실제 검색결과 URL이어야 합니다.`,
    schemaName: `keyp_${spec.platform}_draft`,
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

  // Enforce search-URL pattern: if the model still returned a suspicious URL,
  // replace it with the canonical platform search URL so downstream is safe.
  const canonical = spec.searchUrl(queries[0] ?? interest);
  return (out.items ?? []).slice(0, limit).map((d) => ({
    ...d,
    sources: (d.sources ?? []).map((s) => {
      const looksFake = !s.url || !/^https?:\/\//i.test(s.url) || /example\.com/i.test(s.url);
      return { ...s, url: looksFake ? canonical : s.url };
    }),
  }));
}

// Full per-platform pipeline: collect → verify → summarize (return FeedItems).
export async function runPlatformCollector(opts: {
  platform: SnsPlatform;
  interest: string;
  queries: string[];
  limit: number;
  language: string;
}): Promise<KeypFeedItem[]> {
  const spec = getPlatformSpec(opts.platform);
  if (!spec) return [];
  const drafts = await draftForPlatform(
    spec,
    opts.interest,
    opts.queries,
    opts.limit,
    opts.language,
  );
  const verified = await verifyDrafts(opts.interest, spec.platform, drafts);
  return toFeedItems(opts.interest, spec.platform, verified);
}
