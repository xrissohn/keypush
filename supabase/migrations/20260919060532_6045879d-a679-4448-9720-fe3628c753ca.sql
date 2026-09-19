-- Context Watch storage. No auth yet: server-only access (service_role).
-- TODO(auth): add owner_id-scoped policies for `authenticated` once sign-in exists.

CREATE TABLE public.context_watches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NULL,
  raw_query TEXT NOT NULL,
  intent_summary TEXT NOT NULL DEFAULT '',
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_engine TEXT NOT NULL DEFAULT 'unknown',
  active BOOLEAN NOT NULL DEFAULT true,
  refresh_minutes INTEGER NOT NULL DEFAULT 60 CHECK (refresh_minutes >= 15),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ NULL,
  last_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.context_watches TO service_role;
ALTER TABLE public.context_watches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.watch_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watch_id UUID NOT NULL REFERENCES public.context_watches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  trigger TEXT NOT NULL DEFAULT 'manual',
  engines_used TEXT[] NOT NULL DEFAULT '{}',
  step_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings_count INTEGER NOT NULL DEFAULT 0,
  error TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.watch_runs TO service_role;
ALTER TABLE public.watch_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watch_id UUID NOT NULL REFERENCES public.context_watches(id) ON DELETE CASCADE,
  run_id UUID NULL REFERENCES public.watch_runs(id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  why_matched TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'web',
  discovered_by TEXT[] NOT NULL DEFAULT '{}',
  match_score INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT false,
  matched_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watch_id, dedupe_key)
);
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE INDEX findings_watch_score_idx ON public.findings (watch_id, match_score DESC);

CREATE TABLE public.source_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status_code INTEGER NULL,
  snippet TEXT NOT NULL DEFAULT '',
  accessible BOOLEAN NOT NULL DEFAULT false,
  is_x BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.source_evidence TO service_role;
ALTER TABLE public.source_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watch_id UUID NOT NULL REFERENCES public.context_watches(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NULL,
  UNIQUE (finding_id, channel)
);
GRANT ALL ON public.notification_queue TO service_role;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER context_watches_updated_at BEFORE UPDATE ON public.context_watches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER findings_updated_at BEFORE UPDATE ON public.findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lock-safe scheduler claim: marks due watches as claimed by pushing next_run_at
-- forward inside the same statement, so concurrent ticks cannot double-run one.
CREATE OR REPLACE FUNCTION public.claim_due_watches(p_limit INTEGER DEFAULT 5)
RETURNS SETOF public.context_watches
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.context_watches w
  SET next_run_at = now() + make_interval(mins => w.refresh_minutes),
      last_run_at = now()
  WHERE w.id IN (
    SELECT id FROM public.context_watches
    WHERE active AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING w.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_watches(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) TO service_role;