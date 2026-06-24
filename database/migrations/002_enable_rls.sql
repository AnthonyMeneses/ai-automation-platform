-- Enable Row Level Security on every application table.
--
-- The Express backend connects with the `postgres` role (direct/pooled
-- connection), which owns these tables and BYPASSES RLS, so the app keeps full
-- access. Enabling RLS with NO policies denies the Supabase auto-exposed data
-- API (the anon / authenticated roles behind PostgREST): client data can never
-- be read or written through the public REST endpoint — only through our
-- audited backend. This also clears Supabase's "RLS disabled in public"
-- security advisor.

ALTER TABLE admin_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE websites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_calls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_sync_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_api_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations   ENABLE ROW LEVEL SECURITY;
