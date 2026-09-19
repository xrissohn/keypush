ALTER TABLE public.context_watches
  ADD COLUMN IF NOT EXISTS baseline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS baseline_completed_at TIMESTAMPTZ;

UPDATE public.context_watches
SET baseline_at = created_at
WHERE baseline_at IS NULL;

ALTER TABLE public.context_watches
  ALTER COLUMN baseline_at SET DEFAULT now(),
  ALTER COLUMN baseline_at SET NOT NULL;

ALTER TABLE public.findings
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS semantic_fingerprint TEXT;

UPDATE public.findings
SET canonical_url = source_url
WHERE canonical_url IS NULL;

CREATE INDEX IF NOT EXISTS findings_watch_time_idx
  ON public.findings (watch_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS findings_watch_fingerprint_idx
  ON public.findings (watch_id, semantic_fingerprint)
  WHERE semantic_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS findings_watch_content_hash_idx
  ON public.findings (watch_id, content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE public.notification_queue
SET status = 'queued'
WHERE status = 'pending';

ALTER TABLE public.notification_queue
  ALTER COLUMN status SET DEFAULT 'queued';

CREATE INDEX IF NOT EXISTS notification_queue_status_created_idx
  ON public.notification_queue (status, created_at DESC);

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
    WHERE active
      AND baseline_completed_at IS NOT NULL
      AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING w.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_watches(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) TO service_role;