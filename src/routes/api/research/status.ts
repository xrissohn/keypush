import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/research/status")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        // Booleans / model names only — never secret values.
        return Response.json({
          daytonaConfigured: Boolean(process.env["DAYTONA_API_KEY"]),
          geminiConfigured: Boolean(process.env["GEMINI_API_KEY"]),
          grokConfigured: Boolean(process.env["XAI_API_KEY"]),
          openaiConfigured: Boolean(process.env["OPENAI_API_KEY"]),
          lovableAiAvailable: Boolean(process.env["LOVABLE_API_KEY"]),
          geminiModel: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
          grokModel: process.env["GROK_MODEL"] || "grok-4.6",
          openaiModel: process.env["OPENAI_REASONING_MODEL"] || "gpt-5.6-terra",
          openaiDeepModel: process.env["OPENAI_DEEP_REASONING_MODEL"] || "gpt-5.6-sol",
        });
      },
    },
  },
});
