// Browser-side interest storage. Simple localStorage — no backend needed for MVP.
import type { KeypFeedItem } from "./types";

const K_INTERESTS = "keyp.interests";
const K_FEED = "keyp.feed";

export interface Interest {
  id: string;
  label: string;
  enabled: boolean;
  createdAt: string;
}

export function loadInterests(): Interest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(K_INTERESTS) ?? "[]") as Interest[];
  } catch {
    return [];
  }
}

export function saveInterests(list: Interest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_INTERESTS, JSON.stringify(list));
}

export function loadFeed(): KeypFeedItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(K_FEED) ?? "[]") as KeypFeedItem[];
  } catch {
    return [];
  }
}

export function saveFeed(items: KeypFeedItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_FEED, JSON.stringify(items.slice(0, 100)));
}

export function prependFeed(items: KeypFeedItem[]) {
  const existing = loadFeed();
  const ids = new Set(existing.map((x) => x.id));
  const merged = [...items.filter((x) => !ids.has(x.id)), ...existing];
  saveFeed(merged);
  return merged;
}
