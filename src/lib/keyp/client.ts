// KeyP client SDK — teammates import this to call the API from any frontend.
//   import { keypClient } from "@/lib/keyp/client";
//   const res = await keypClient.search({ interest: "BTS 월드투어" });
import type {
  KeypErrorResponse,
  KeypSearchRequest,
  KeypSearchResponse,
} from "./types";

export interface KeypClientOptions {
  baseUrl?: string; // defaults to same-origin
}

export function createKeypClient(opts: KeypClientOptions = {}) {
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");

  return {
    async search(
      req: KeypSearchRequest,
    ): Promise<KeypSearchResponse | KeypErrorResponse> {
      const res = await fetch(`${base}/api/public/keyp/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return (await res.json()) as KeypSearchResponse | KeypErrorResponse;
    },
  };
}

export const keypClient = createKeypClient();
export type { KeypSearchRequest, KeypSearchResponse, KeypErrorResponse };
export type { KeypFeedItem, KeypSource, SnsPlatform } from "./types";
