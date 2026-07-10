// Public KeyP search endpoint. Anyone can POST { interest, limit?, platforms?, language? }.
// Returns { ok, interest, plan, items[], generatedAt }.
import { createFileRoute } from "@tanstack/react-router";
import { runKeypPipeline } from "@/lib/keyp/pipeline.server";
import type { KeypSearchRequest } from "@/lib/keyp/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/keyp/search")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const interest = url.searchParams.get("interest") ?? "";
        return handle({ interest, limit: Number(url.searchParams.get("limit")) || undefined });
      },
      POST: async ({ request }) => {
        let body: KeypSearchRequest;
        try {
          body = (await request.json()) as KeypSearchRequest;
        } catch {
          return json({ ok: false, error: "invalid json body" }, 400);
        }
        return handle(body);
      },
    },
  },
});

async function handle(req: KeypSearchRequest) {
  if (!req?.interest?.trim()) {
    return json({ ok: false, error: "interest is required" }, 400);
  }
  try {
    const result = await runKeypPipeline(req);
    return json(result, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
