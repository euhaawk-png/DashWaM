-- Row-Level Security — the tenant isolation layer.
--
-- The application MUST connect as a role without BYPASSRLS (see crm_app below).
-- FORCE ROW LEVEL SECURITY makes the policies apply even to the table owner,
-- so a forgotten WHERE tenant_id = ... can never leak data across tenants.
--
-- Every tenant-scoped transaction sets:
--   SELECT set_config('app.current_tenant_id', '<uuid>', true);
-- (src/db/index.ts withTenant). Without it, current_setting(..., true) yields
-- NULL/'' and every policy evaluates to false → zero rows, zero writes.

-- Application role (idempotent). Passwords are set by the operator, not here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
-- Audit log is append-only at the grant level too.
REVOKE UPDATE, DELETE ON activity_log FROM crm_app;

-- Helper expression used by all policies.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION is_platform_admin_ctx() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.platform_admin', true) = 'on'
$$;

-- Enable + force RLS and add strict tenant policies on every tenant table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'whatsapp_accounts', 'contacts', 'conversations',
    'messages', 'pipelines', 'stages', 'deals', 'deal_events', 'forms',
    'form_submissions', 'inbound_webhooks', 'webhook_events',
    'lead_routing_rules', 'quick_replies', 'wa_templates', 'activity_log',
    'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Default policy: tenant match on read AND write (USING + WITH CHECK).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'whatsapp_accounts', 'contacts', 'conversations', 'messages',
    'pipelines', 'stages', 'deals', 'deal_events', 'forms',
    'form_submissions', 'inbound_webhooks', 'webhook_events',
    'lead_routing_rules', 'quick_replies', 'wa_templates', 'notifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL
         USING (tenant_id = current_tenant_id())
         WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- memberships: also readable by the member themself (login-time tenant picker
-- runs before a tenant context exists). Writes still require tenant context.
CREATE POLICY tenant_isolation ON memberships FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY member_self_read ON memberships FOR SELECT
  USING (user_id = current_app_user_id());

-- whatsapp_accounts: platform admin may read connection METADATA (status page).
-- No other tenant table grants platform-admin read — conversations, messages,
-- contacts and deals stay invisible to the platform operator by default.
CREATE POLICY platform_admin_read ON whatsapp_accounts FOR SELECT
  USING (is_platform_admin_ctx());

-- activity_log: append-only. INSERT + SELECT within the tenant; no UPDATE or
-- DELETE policy exists, so RLS denies them even for the table owner.
CREATE POLICY audit_insert ON activity_log FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY audit_read ON activity_log FOR SELECT
  USING (tenant_id = current_tenant_id());
