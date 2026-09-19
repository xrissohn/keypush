import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daytona/status")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        const { isDaytonaConfigured } = await import("@/lib/daytona/client.server");
        return Response.json({ configured: isDaytonaConfigured() });
      },
    },
  },
});
