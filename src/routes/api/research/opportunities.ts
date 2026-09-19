import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const profileSchema = z.object({
  company: z.string().min(1).max(200),
  location: z.string().max(200),
  industry: z.string().max(300),
  companyType: z.string().max(200),
  interests: z.array(z.string().max(120)).max(20),
});

const bodySchema = z.object({
  query: z.string().min(2).max(600),
  companyProfile: profileSchema.optional(),
  maxResults: z.number().int().min(1).max(8).optional(),
});

export const Route = createFileRoute("/api/research/opportunities")({
  server: {
    handlers: {
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
            {
              ok: false,
              code: "bad_request",
              error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
            },
            { status: 400 },
          );
        }

        const { runResearchInSandbox } = await import("@/lib/research/research-executor.server");
        const result = await runResearchInSandbox(parsed.data);
        if (!result.ok) {
          return Response.json(result, { status: result.code === "not_configured" ? 503 : 502 });
        }
        return Response.json(result);
      },
    },
  },
});
