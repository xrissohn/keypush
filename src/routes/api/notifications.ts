import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const readSchema = z.object({ ids: z.array(z.string().uuid()).max(50).optional() });

export const Route = createFileRoute("/api/notifications")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listNotifications } = await import("@/lib/context/watch-runner.server");
          return Response.json({ ok: true, notifications: await listNotifications() });
        } catch (error) {
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const parsed = readSchema.safeParse(await request.json());
          if (!parsed.success) return Response.json({ ok: false, error: "invalid notification ids" }, { status: 400 });
          const { markNotificationsRead } = await import("@/lib/context/watch-runner.server");
          await markNotificationsRead(parsed.data.ids);
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});