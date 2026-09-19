import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SAMPLE_COMPANY_PROFILE } from "@/lib/daytona/types";

const opportunitySchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  category: z.string().max(100).default(""),
  deadline: z.string().max(200).default(""),
  organizer: z.string().max(200).default(""),
  location: z.string().max(200).default(""),
  matchScore: z.number().min(0).max(100).default(0),
  why: z.string().max(2000).default(""),
  url: z.string().max(1000).default(""),
  sample: z.boolean().optional(),
});

const profileSchema = z.object({
  company: z.string().min(1).max(200),
  location: z.string().max(200),
  industry: z.string().max(300),
  companyType: z.string().max(200),
  interests: z.array(z.string().max(120)).max(20),
});

const bodySchema = z.object({
  opportunity: opportunitySchema,
  companyProfile: profileSchema.optional(),
  demoMode: z.boolean().optional(),
});

export const Route = createFileRoute("/api/daytona/run-opportunity")({
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
            { ok: false, code: "bad_request", error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
            { status: 400 },
          );
        }

        const { opportunity, companyProfile = SAMPLE_COMPANY_PROFILE, demoMode } = parsed.data;
        const { runOpportunityInSandbox, simulateOpportunityRun } = await import(
          "@/lib/daytona/opportunity-executor.server"
        );

        if (demoMode === true) {
          return Response.json(simulateOpportunityRun(opportunity, companyProfile));
        }

        const result = await runOpportunityInSandbox(opportunity, companyProfile);
        if (!result.ok) {
          return Response.json(result, { status: result.code === "not_configured" ? 503 : 502 });
        }
        return Response.json(result);
      },
    },
  },
});
