// Shared helpers for per-platform collectors.
// Each collector is a self-contained collect→verify→summarize module so we can
// swap the "collect" step for a real API/Firecrawl call later without touching
// the pipeline.
import type { KeypFeedItem, KeypSource, SnsPlatform } from "../types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

function requireKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

export async function callJsonAI<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: unknown;
}): Promise<T> {
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
        json_schema: { name: opts.schemaName, strict: false, schema: opts.jsonSchema },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway [${res.status}] ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    return (m ? JSON.parse(m[0]) : {}) as T;
  }
}

// Shape returned by every platform collector's raw draft step (pre-verification).
export interface DraftItem {
  headline: string;
  summary: string;
  keywords: string[];
  sources: Array<Omit<KeypSource, "platform"> & { platform?: string }>;
  // model's self-reported confidence 0-100
  rawConfidence: number;
}

export interface VerifiedItem extends DraftItem {
  credibility: number; // post-verification 0-100
  verificationNotes?: string;
}

export function toFeedItems(
  interest: string,
  platform: SnsPlatform,
  items: VerifiedItem[],
): KeypFeedItem[] {
  const now = new Date().toISOString();
  return items.map((it, i) => ({
    id: `${Date.now()}-${platform}-${i}`,
    interest,
    createdAt: now,
    headline: it.headline,
    summary: it.summary,
    keywords: it.keywords.slice(0, 8),
    credibility: Math.max(0, Math.min(100, Math.round(it.credibility))),
    sources: it.sources.map((s) => ({
      platform,
      url: s.url,
      title: s.title,
      author: s.author,
      publishedAt: s.publishedAt,
    })),
  }));
}

// Generic verification pass: cross-check the model's own drafts and adjust
// credibility down when claims look speculative, sources look fake, or the
// summary contradicts the headline.
export async function verifyDrafts(
  interest: string,
  platform: SnsPlatform,
  drafts: DraftItem[],
): Promise<VerifiedItem[]> {
  if (drafts.length === 0) return [];
  const out = await callJsonAI<{
    items: Array<{ index: number; credibility: number; notes?: string }>;
  }>({
    system:
      "당신은 KeyP의 Verifier입니다. 주어진 초안 항목들의 사실성/출처 신뢰도를 " +
      "엄격히 재평가하세요. 규칙: (1) 개별 게시물 URL을 위조한 것으로 보이면 신뢰도 -30, " +
      "(2) 플랫폼 검색결과 URL이면 +0, (3) 헤드라인이 과장/추측이면 -20, " +
      "(4) 요약이 헤드라인과 모순되면 -25, (5) 확실한 최신·공식 정보면 +10. " +
      "최종 credibility(0-100)와 짧은 notes를 반환. JSON만.",
    user:
      `관심사: ${interest}\n플랫폼: ${platform}\n초안 개수: ${drafts.length}\n` +
      drafts
        .map(
          (d, i) =>
            `[${i}] headline=${d.headline}\n    summary=${d.summary}\n    rawConf=${d.rawConfidence}\n    sources=${d.sources.map((s) => s.url).join(" | ")}`,
        )
        .join("\n"),
    schemaName: "keyp_verify",
    jsonSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              credibility: { type: "number" },
              notes: { type: "string" },
            },
            required: ["index", "credibility"],
          },
        },
      },
      required: ["items"],
    },
  });

  const byIndex = new Map(out.items.map((v) => [v.index, v]));
  return drafts.map((d, i) => {
    const v = byIndex.get(i);
    return {
      ...d,
      credibility: v?.credibility ?? d.rawConfidence,
      verificationNotes: v?.notes,
    };
  });
}
