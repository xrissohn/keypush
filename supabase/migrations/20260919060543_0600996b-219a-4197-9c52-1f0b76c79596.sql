REVOKE EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_watches(INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;