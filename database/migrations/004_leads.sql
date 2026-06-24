-- Leads: prospects who submitted the public "get started" form. The admin
-- reviews them in the dashboard and converts a lead into a client (which then
-- gets a Stripe checkout link).

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  plan_interest VARCHAR(50)
    CHECK (plan_interest IN ('starter', 'pro', 'enterprise')),
  message TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'landing',
  status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'converted', 'dismissed')),
  ip_address INET,
  user_agent TEXT,
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON leads (status, created_at DESC);

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Deny-all RLS to match every other table (the public REST API must not see
-- leads; the backend's postgres role bypasses RLS).
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
