CREATE POLICY "Server manages context watches"
ON public.context_watches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Server manages watch runs"
ON public.watch_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Server manages findings"
ON public.findings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Server manages source evidence"
ON public.source_evidence
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Server manages notifications"
ON public.notification_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);