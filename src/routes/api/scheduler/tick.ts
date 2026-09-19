// Scheduler tick: processes a bounded number of due watches.
// Idempotent / lock-safe: public.claim_due_watches() pushes next_run_at forward with
// FOR UPDATE SKIP LOCKED, so concurrent ticks never run the same watch twice.
//
// TODO(deploy): after publishing, schedule this endpoint every ~15 minutes with
// pg_cron + pg_net against the stable production URL (or any external scheduler):
//   select cron.schedule('keyp-watch-tick','*/15 * * * *',
//     $$ select net.http_post('https://<your-production-url>/api/scheduler/tick',
//        '{"limit":3}'::jsonb, headers => '{"Content-Type":"application/json"}'::jsonb) $$);
// Preview URLs are intentionally NOT hardcoded here.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scheduler/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let limit = 3;
        try {
          const body = (await request.json()) as { limit?: number };
          if (typeof body?.limit === "number") limit = Math.min(Math.max(Math.round(body.limit), 1), 10);
        } catch {
          /* empty body is fine */
        }
        try {
          const { tickScheduler } = await import("@/lib/context/watch-runner.server");
          const out = await tickScheduler(limit);
          return Response.json({ ok: true, ...out });
        } catch (e) {
          return Response.json({ ok: false, code: "engine_error", error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
