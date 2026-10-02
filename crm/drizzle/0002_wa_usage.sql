-- Meta service-message cost tracking (Meta pricing rule effective 2026-10-01):
-- receiving is free; each number gets 1,000 free service responses per month;
-- beyond that Meta charges per DELIVERED message (BR ~R$ 0.035). This table is
-- a LOCAL ESTIMATE (sent-message proxy) — official billing happens at Meta.

CREATE TABLE wa_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  month date NOT NULL, -- first day of the month in the WABA timezone (America/Sao_Paulo)
  service_messages_sent int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number_id, month)
);

ALTER TABLE wa_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_usage_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wa_usage_monthly FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
-- Platform admin may read usage counters (operational metadata, not content).
CREATE POLICY platform_admin_read ON wa_usage_monthly FOR SELECT
  USING (is_platform_admin_ctx());

-- Platform-wide settings editable in the super admin (e.g. META_SERVICE_MSG_BRL).
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON wa_usage_monthly, platform_settings TO crm_app;
