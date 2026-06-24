-- Initial schema for the AI automation platform.
-- Run via backend/scripts/migrate.js, which wraps each file in a transaction.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- search_path is pinned empty so the function can't be hijacked via a mutable
-- path (pg_catalog is always searched implicitly, so now() still resolves).
-- Also satisfies Supabase's "Function Search Path Mutable" linter.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin identity & sessions
-- ---------------------------------------------------------------------------

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'Admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES refresh_tokens(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_admin ON refresh_tokens (admin_user_id);

-- ---------------------------------------------------------------------------
-- Clients & billing
-- ---------------------------------------------------------------------------

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  twilio_phone_number VARCHAR(20) UNIQUE,
  subscription_tier VARCHAR(50) NOT NULL DEFAULT 'starter'
    CHECK (subscription_tier IN ('starter', 'pro', 'enterprise')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trial', 'suspended', 'churned')),
  stripe_customer_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_clients_email_lower ON clients (lower(email));

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid',
                      'incomplete', 'incomplete_expired', 'paused')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'usd',
  payment_method VARCHAR(50),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_client ON subscriptions (client_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
  failure_reason TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_client ON payments (client_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Websites
-- ---------------------------------------------------------------------------

CREATE TABLE websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain VARCHAR(255) UNIQUE,
  template_id VARCHAR(100) NOT NULL DEFAULT 'default',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_url VARCHAR(500),
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT websites_client_unique UNIQUE (client_id)
);

-- ---------------------------------------------------------------------------
-- Phone automation
-- ---------------------------------------------------------------------------

CREATE TABLE phone_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  twilio_call_sid VARCHAR(64) NOT NULL UNIQUE,
  direction VARCHAR(10) NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound')),
  caller_phone VARCHAR(20),
  to_phone VARCHAR(20),
  duration_seconds INTEGER CHECK (duration_seconds >= 0),
  transcript TEXT,
  call_outcome VARCHAR(50)
    CHECK (call_outcome IN ('completed', 'missed', 'voicemail', 'failed',
                            'busy', 'in_progress')),
  ai_intent VARCHAR(100),
  ai_sentiment VARCHAR(20),
  ai_summary TEXT,
  ai_action_items JSONB,
  recording_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_phone_calls_client ON phone_calls (client_id, created_at DESC);
CREATE INDEX idx_phone_calls_created ON phone_calls (created_at DESC);

-- ---------------------------------------------------------------------------
-- Payroll bridge
-- ---------------------------------------------------------------------------

CREATE TABLE payroll_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payroll_service VARCHAR(50) NOT NULL CHECK (payroll_service IN ('adp', 'gusto')),
  api_status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (api_status IN ('pending', 'connected', 'synced', 'error', 'disconnected')),
  encrypted_credentials TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_connections_client_service_unique UNIQUE (client_id, payroll_service)
);

CREATE TABLE payroll_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES payroll_connections(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'error', 'rejected')),
  validation_result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_payroll_sync_logs_client ON payroll_sync_logs (client_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Support
-- ---------------------------------------------------------------------------

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_status ON support_tickets (status, created_at DESC);
CREATE INDEX idx_support_tickets_client ON support_tickets (client_id);

-- ---------------------------------------------------------------------------
-- Audit & AI usage logs
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_admin ON audit_logs (admin_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);

CREATE TABLE ai_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  purpose VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_api_logs_created ON ai_api_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_websites_updated BEFORE UPDATE ON websites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_phone_calls_updated BEFORE UPDATE ON phone_calls
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_connections_updated BEFORE UPDATE ON payroll_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_support_tickets_updated BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
