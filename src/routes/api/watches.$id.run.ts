// Run one Context Watch immediately.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/watches/$id/run")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const id = params["id"];
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return Response.json({ ok: false, code: "bad_request", error: "invalid watch id" }, { status: 400 });
        }
        const { runWatch } = await import("@/lib/context/watch-runner.server");
        const result = await runWatch(id, "manual");
        if (!result.ok) {
          const status = result.code === "not_found" ? 404 : result.code === "not_configured" ? 503 : 502;
          return Response.json(result, { status });
        }
        return Response.json(result);
      },
    },
  },
});
