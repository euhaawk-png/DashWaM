-- ============================================================================
-- CRM v1 — setup completo para o SQL Editor do Supabase
-- Conteúdo, na ordem: schema (0000_init) + RLS e papel da aplicação
-- (0001_rls) + senha do papel crm_app + registro em _migrations + seed.
-- IDEMPOTENTE: pode ser executado mais de uma vez sem erro.
-- Depois de rodar, o app conecta via pooler como:
--   postgresql://crm_app.<project-ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
-- ============================================================================

-- ======================= 0000_init.sql (idempotente) =======================

-- CRM v1 — initial schema.
-- Every business table carries tenant_id and is protected by RLS (0001_rls.sql).
-- Global tables (no tenant_id): tenants, users, sessions, password_reset_tokens,
-- invitations, public_endpoints, jobs, rate_limits.

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase >= 15): no extension needed.

-- ---------------------------------------------------------------- global ---

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active', -- active | suspended
  plan text NOT NULL DEFAULT 'standard',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  totp_secret_enc text,          -- AES-256-GCM, null = 2FA disabled
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, -- sha256 of the cookie token
  active_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  totp_pending boolean NOT NULL DEFAULT false,
  ip text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL, -- owner | manager | seller
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Maps public keys (form slug, inbound-webhook token, WA phone_number_id) to a
-- tenant so unauthenticated entry points can resolve the tenant before opening
-- a tenant-scoped transaction. Operational metadata only — no business data.
CREATE TABLE IF NOT EXISTS public_endpoints (
  kind text NOT NULL, -- form_slug | hook_token | wa_phone
  key text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, key)
);

-- Background jobs (webhook retries, leadgen fetch, alerts). Global: the worker
-- scans across tenants, then processes each job inside its tenant context.
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs(status, run_at);

-- Fixed-window rate limiting shared across serverless instances.
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- tenant ---

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL, -- owner | manager | seller
  status text NOT NULL DEFAULT 'active', -- active | disabled
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone text,
  verified_name text,
  access_token_enc text NOT NULL, -- AES-256-GCM, never plaintext
  status text NOT NULL DEFAULT 'connected', -- connected | disconnected | error
  quality_rating text,
  messaging_limit text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_webhook_at timestamptz,
  UNIQUE (tenant_id, phone_number_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text, -- E.164
  name text,
  email text,
  profile_pic_url text,
  source text,
  extra jsonb NOT NULL DEFAULT '{}',
  deleted_at timestamptz, -- LGPD soft delete; purge job hard-deletes later
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS contacts_tenant_idx ON contacts(tenant_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open', -- open | pending | closed
  assigned_to uuid REFERENCES users(id),
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz, -- start of the 24h customer-service window
  unread_count int NOT NULL DEFAULT 0,
  first_response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contact_id)
);
CREATE INDEX IF NOT EXISTS conversations_tenant_idx ON conversations(tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL, -- in | out
  type text NOT NULL DEFAULT 'text', -- text|image|audio|video|document|location|contacts|template|note
  body text,
  media_id text,
  media_mime text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'received', -- received|pending|sent|delivered|read|failed
  error_message text,
  is_internal_note boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES users(id), -- set for outbound / notes
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(tenant_id, conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_id_idx ON messages(tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'open' -- open | won | lost
);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES stages(id),
  title text NOT NULL,
  value numeric(14,2),
  product text,
  owner_id uuid REFERENCES users(id),
  source text, -- whatsapp | form:{name} | google_ads | meta_ads | wordpress | manual
  utm jsonb NOT NULL DEFAULT '{}',
  custom jsonb NOT NULL DEFAULT '{}',
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_tenant_stage_idx ON deals(tenant_id, stage_id);

CREATE TABLE IF NOT EXISTS deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL, -- created | stage_change | won | lost | note | reopened
  data jsonb NOT NULL DEFAULT '{}',
  user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_events_deal_idx ON deal_events(tenant_id, deal_id, created_at);

CREATE TABLE IF NOT EXISTS forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  fields jsonb NOT NULL DEFAULT '[]', -- [{key,label,type,required}]
  button_label text NOT NULL DEFAULT 'Enviar',
  success_message text NOT NULL DEFAULT 'Recebemos seus dados. Em breve entraremos em contato!',
  show_whatsapp_cta boolean NOT NULL DEFAULT true,
  consent_text text,
  pipeline_id uuid REFERENCES pipelines(id),
  stage_id uuid REFERENCES stages(id),
  distribute boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  utm jsonb NOT NULL DEFAULT '{}',
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  wa_cta_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL, -- google_ads | wordpress | generic | meta_leadgen
  name text NOT NULL,
  token text NOT NULL UNIQUE, -- random URL segment
  secret_enc text, -- google_key / HMAC secret / page access token (encrypted)
  field_map jsonb NOT NULL DEFAULT '{}', -- {payloadKey: contactField}
  meta jsonb NOT NULL DEFAULT '{}', -- page_id, form ids, etc.
  last_payload jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id uuid REFERENCES inbound_webhooks(id) ON DELETE CASCADE,
  source text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received', -- received | processed | failed | rejected
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_tenant_idx ON webhook_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text, -- null = default rule
  mode text NOT NULL DEFAULT 'round_robin', -- round_robin | fixed | unassigned
  fixed_user_id uuid REFERENCES users(id),
  last_assigned_user_id uuid REFERENCES users(id), -- round-robin cursor
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, source)
);

CREATE TABLE IF NOT EXISTS quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  body text NOT NULL,
  UNIQUE (tenant_id, shortcut)
);

CREATE TABLE IF NOT EXISTS wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text NOT NULL DEFAULT 'MARKETING',
  status text NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  body text NOT NULL,
  components jsonb NOT NULL DEFAULT '[]',
  wa_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, language)
);

-- In-app notifications (new lead assigned, slow-response alert, ...).
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(tenant_id, user_id, created_at DESC);

-- Append-only audit trail (INSERT/SELECT only — enforced by RLS + grants).
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  action text NOT NULL, -- login | export_csv | role_change | deal_update | ...
  entity text,
  entity_id text,
  data jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_tenant_idx ON activity_log(tenant_id, created_at DESC);


-- ======================= 0001_rls.sql (idempotente) ========================

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
    CREATE ROLE crm_app LOGIN NOBYPASSRLS PASSWORD 'bd297d42abc90180dae95cb90e13ff8054df4b8586937351';
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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL
         USING (tenant_id = current_tenant_id())
         WITH CHECK (tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- memberships: also readable by the member themself (login-time tenant picker
-- runs before a tenant context exists). Writes still require tenant context.
DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY tenant_isolation ON memberships FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS member_self_read ON memberships;
CREATE POLICY member_self_read ON memberships FOR SELECT
  USING (user_id = current_app_user_id());

-- whatsapp_accounts: platform admin may read connection METADATA (status page).
-- No other tenant table grants platform-admin read — conversations, messages,
-- contacts and deals stay invisible to the platform operator by default.
DROP POLICY IF EXISTS platform_admin_read ON whatsapp_accounts;
CREATE POLICY platform_admin_read ON whatsapp_accounts FOR SELECT
  USING (is_platform_admin_ctx());

-- activity_log: append-only. INSERT + SELECT within the tenant; no UPDATE or
-- DELETE policy exists, so RLS denies them even for the table owner.
DROP POLICY IF EXISTS audit_insert ON activity_log;
CREATE POLICY audit_insert ON activity_log FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS audit_read ON activity_log;
CREATE POLICY audit_read ON activity_log FOR SELECT
  USING (tenant_id = current_tenant_id());

-- ============================================================================
-- Senha do papel da aplicação (usada na DATABASE_URL de produção)
-- ============================================================================
DO $$
BEGIN
  ALTER ROLE crm_app PASSWORD 'bd297d42abc90180dae95cb90e13ff8054df4b8586937351';
EXCEPTION WHEN insufficient_privilege THEN
  -- Role pre-existed and this session lacks ADMIN on it (PG16+): the password
  -- set at creation time remains valid; nothing to do.
  RAISE NOTICE 'crm_app password unchanged (insufficient privilege) — ok on re-run';
END $$;

-- ============================================================================
-- Registro em _migrations, para o npm run db:migrate reconhecer o banco como
-- migrado e aplicar apenas migrações futuras.
-- ============================================================================
CREATE TABLE IF NOT EXISTS _migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO _migrations (name) VALUES ('0000_init.sql'), ('0001_rls.sql')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Seed — mesmos usuários demo do scripts/seed.ts.
-- Senha de login de TODOS os usuários abaixo: Trocar-esta-senha-123
-- (hash bcrypt custo 12 gerado offline; troque as senhas após o 1º acesso).
-- ============================================================================
DO $seed$
DECLARE
  pwd_hash text := '$2b$12$CveT594bgoo9pJrCKmOU5O2giz/9UpawKJlwgKBoMybKlc0FExuzy';
  tid uuid;
  uid uuid;
  pid uuid;
BEGIN
  -- Platform admin (global; painel /admin)
  INSERT INTO users (email, name, password_hash, is_platform_admin)
  VALUES ('admin@plataforma.local', 'Admin da Plataforma', pwd_hash, true)
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

  -- Demo tenant
  INSERT INTO tenants (name, slug) VALUES ('Empresa Demo', 'empresa-demo')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO tid;

  -- Tenant context: obrigatório porque FORCE RLS vale até para o dono das
  -- tabelas (no Supabase o papel postgres não tem BYPASSRLS).
  PERFORM set_config('app.current_tenant_id', tid::text, false);

  -- Default pipeline + stages + routing rule (only on first run)
  IF NOT EXISTS (SELECT FROM pipelines WHERE tenant_id = tid) THEN
    INSERT INTO pipelines (tenant_id, name, is_default)
    VALUES (tid, 'Funil de vendas', true)
    RETURNING id INTO pid;
    INSERT INTO stages (tenant_id, pipeline_id, name, kind, position) VALUES
      (tid, pid, 'Novo lead', 'open', 0),
      (tid, pid, 'Em atendimento', 'open', 1),
      (tid, pid, 'Proposta', 'open', 2),
      (tid, pid, 'Ganhou', 'won', 3),
      (tid, pid, 'Perdeu', 'lost', 4);
    INSERT INTO lead_routing_rules (tenant_id, source, mode)
    VALUES (tid, NULL, 'round_robin');
  END IF;

  -- Demo users + memberships
  INSERT INTO users (email, name, password_hash)
  VALUES ('dono@demo.local', 'Dona Demo', pwd_hash)
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO uid;
  INSERT INTO memberships (tenant_id, user_id, role) VALUES (tid, uid, 'owner')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  INSERT INTO users (email, name, password_hash)
  VALUES ('gerente@demo.local', 'Gerente Demo', pwd_hash)
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO uid;
  INSERT INTO memberships (tenant_id, user_id, role) VALUES (tid, uid, 'manager')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  INSERT INTO users (email, name, password_hash)
  VALUES ('vendedor@demo.local', 'Vendedor Demo', pwd_hash)
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO uid;
  INSERT INTO memberships (tenant_id, user_id, role) VALUES (tid, uid, 'seller')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
END
$seed$;
