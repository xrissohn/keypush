import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const idPattern = /^[0-9a-f-]{36}$/i;
const updateSchema = z.object({
  active: z.boolean().optional(),
  refreshMinutes: z.number().int().min(15).max(10080).optional(),
});

export const Route = createFileRoute("/api/watches/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        if (!idPattern.test(params.id)) return Response.json({ ok: false, error: "invalid watch id" }, { status: 400 });
        try {
          const parsed = updateSchema.safeParse(await request.json());
          if (!parsed.success) return Response.json({ ok: false, error: "invalid watch settings" }, { status: 400 });
          const { updateWatch } = await import("@/lib/context/watch-runner.server");
          return Response.json({ ok: true, watch: await updateWatch(params.id, parsed.data) });
        } catch (error) {
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        if (!idPattern.test(params.id)) return Response.json({ ok: false, error: "invalid watch id" }, { status: 400 });
        try {
          const { deleteWatch } = await import("@/lib/context/watch-runner.server");
          await deleteWatch(params.id);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});