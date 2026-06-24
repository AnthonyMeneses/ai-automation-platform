-- Harden the Supabase-provided event-trigger helper public.rls_auto_enable()
-- (it auto-enables RLS on newly created public tables): revoke the default
-- public EXECUTE so the function can't be invoked through the PostgREST RPC
-- endpoint by the anon / authenticated roles. The event trigger itself is
-- unaffected — it fires via the system, not via this grant.
--
-- Guarded + idempotent: a no-op on databases that don't have this Supabase-
-- specific function (e.g. a plain local/Docker Postgres), so `npm run migrate`
-- is safe to run everywhere.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'rls_auto_enable' AND n.nspname = 'public'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
  END IF;
END $$;
