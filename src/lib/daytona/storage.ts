// Browser-side persistence for the hackathon demo (opportunities + run history).
import { SAMPLE_OPPORTUNITIES } from "./samples";
import type { Opportunity, RunResultOk } from "./types";

const K_OPPS = "keyp.opportunities";
const K_RUNS = "keyp.runs";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadOpportunities(): Opportunity[] {
  const stored = read<Opportunity[] | null>(K_OPPS, null);
  if (stored && stored.length > 0) return stored;
  write(K_OPPS, SAMPLE_OPPORTUNITIES);
  return SAMPLE_OPPORTUNITIES;
}

export function saveOpportunities(list: Opportunity[]) {
  write(K_OPPS, list);
}

export function loadRuns(): RunResultOk[] {
  return read<RunResultOk[]>(K_RUNS, []);
}

export function saveRun(run: RunResultOk): RunResultOk[] {
  const next = [run, ...loadRuns()].slice(0, 30);
  write(K_RUNS, next);
  return next;
}

export function clearRuns() {
  write(K_RUNS, []);
}

/** Restore the 3 sample opportunities and clear run history. */
export function resetDemoData(): { opportunities: Opportunity[]; runs: RunResultOk[] } {
  write(K_OPPS, SAMPLE_OPPORTUNITIES);
  write(K_RUNS, []);
  return { opportunities: SAMPLE_OPPORTUNITIES, runs: [] };
}
