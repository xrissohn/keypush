// Context Watch collection endpoint. Server-only DB access (no auth yet).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ query: z.string().min(4).max(800) });

export const Route = createFileRoute("/api/watches")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listWatches, listFindings } = await import("@/lib/context/watch-runner.server");
          const watches = await listWatches();
          const withFindings = await Promise.all(
            watches.slice(0, 10).map(async (w) => ({ ...w, findings: await listFindings(w.id) })),
          );
          return Response.json({ ok: true, watches: withFindings });
        } catch (e) {
          return Response.json({ ok: false, code: "engine_error", error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, code: "bad_request", error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { ok: false, code: "bad_request", error: parsed.error.issues.map((i) => i.message).join("; ") },
            { status: 400 },
          );
        }
        const { createWatch } = await import("@/lib/context/watch-runner.server");
        const result = await createWatch(parsed.data.query);
        return Response.json(result, { status: result.ok ? 200 : result.code === "not_configured" ? 503 : 500 });
      },
    },
  },
});
