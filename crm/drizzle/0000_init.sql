-- CRM v1 — initial schema.
-- Every business table carries tenant_id and is protected by RLS (0001_rls.sql).
-- Global tables (no tenant_id): tenants, users, sessions, password_reset_tokens,
-- invitations, public_endpoints, jobs, rate_limits.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- global ---

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active', -- active | suspended
  plan text NOT NULL DEFAULT 'standard',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  totp_secret_enc text,          -- AES-256-GCM, null = 2FA disabled
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
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
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
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
CREATE TABLE public_endpoints (
  kind text NOT NULL, -- form_slug | hook_token | wa_phone
  key text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, key)
);

-- Background jobs (webhook retries, leadgen fetch, alerts). Global: the worker
-- scans across tenants, then processes each job inside its tenant context.
CREATE TABLE jobs (
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
CREATE INDEX jobs_due_idx ON jobs(status, run_at);

-- Fixed-window rate limiting shared across serverless instances.
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- tenant ---

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL, -- owner | manager | seller
  status text NOT NULL DEFAULT 'active', -- active | disabled
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE whatsapp_accounts (
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

CREATE TABLE contacts (
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
CREATE INDEX contacts_tenant_idx ON contacts(tenant_id);

CREATE TABLE conversations (
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
CREATE INDEX conversations_tenant_idx ON conversations(tenant_id, last_message_at DESC);

CREATE TABLE messages (
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
CREATE INDEX messages_conv_idx ON messages(tenant_id, conversation_id, created_at);
CREATE UNIQUE INDEX messages_wa_id_idx ON messages(tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'open' -- open | won | lost
);

CREATE TABLE deals (
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
CREATE INDEX deals_tenant_stage_idx ON deals(tenant_id, stage_id);

CREATE TABLE deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL, -- created | stage_change | won | lost | note | reopened
  data jsonb NOT NULL DEFAULT '{}',
  user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_events_deal_idx ON deal_events(tenant_id, deal_id, created_at);

CREATE TABLE forms (
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

CREATE TABLE form_submissions (
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

CREATE TABLE inbound_webhooks (
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

CREATE TABLE webhook_events (
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
CREATE INDEX webhook_events_tenant_idx ON webhook_events(tenant_id, created_at DESC);

CREATE TABLE lead_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text, -- null = default rule
  mode text NOT NULL DEFAULT 'round_robin', -- round_robin | fixed | unassigned
  fixed_user_id uuid REFERENCES users(id),
  last_assigned_user_id uuid REFERENCES users(id), -- round-robin cursor
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, source)
);

CREATE TABLE quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  body text NOT NULL,
  UNIQUE (tenant_id, shortcut)
);

CREATE TABLE wa_templates (
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
CREATE TABLE notifications (
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
CREATE INDEX notifications_user_idx ON notifications(tenant_id, user_id, created_at DESC);

-- Append-only audit trail (INSERT/SELECT only — enforced by RLS + grants).
CREATE TABLE activity_log (
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
CREATE INDEX activity_log_tenant_idx ON activity_log(tenant_id, created_at DESC);
