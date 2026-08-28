import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Mirrors drizzle/0000_init.sql (hand-written migrations are the source of truth).

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("standard"),
  settings: jsonb("settings").$type<TenantSettings>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantSettings = {
  require2fa?: boolean;
  welcomeMessage?: string | null;
  firstResponseAlertMinutes?: number | null;
  onboardingStep?: number;
  onboardingDone?: boolean;
  segment?: string;
  logoUrl?: string | null;
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  totpSecretEnc: text("totp_secret_enc"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  activeTenantId: uuid("active_tenant_id"),
  totpPending: boolean("totp_pending").notNull().default(false),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publicEndpoints = pgTable(
  "public_endpoints",
  {
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    tenantId: uuid("tenant_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.key] })]
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)]
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

// ------------------------------------------------------------------ tenant --

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<Role>().notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId)]
);

export type Role = "owner" | "manager" | "seller";

export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  wabaId: text("waba_id").notNull(),
  phoneNumberId: text("phone_number_id").notNull(),
  displayPhone: text("display_phone"),
  verifiedName: text("verified_name"),
  accessTokenEnc: text("access_token_enc").notNull(),
  status: text("status").notNull().default("connected"),
  qualityRating: text("quality_rating"),
  messagingLimit: text("messaging_limit"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    phone: text("phone"),
    name: text("name"),
    email: text("email"),
    profilePicUrl: text("profile_pic_url"),
    source: text("source"),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_tenant_phone_uq").on(t.tenantId, t.phone)]
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  status: text("status").notNull().default("open"),
  assignedTo: uuid("assigned_to"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessagePreview: text("last_message_preview"),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  unreadCount: integer("unread_count").notNull().default(0),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  direction: text("direction").$type<"in" | "out">().notNull(),
  type: text("type").notNull().default("text"),
  body: text("body"),
  mediaId: text("media_id"),
  mediaMime: text("media_mime"),
  waMessageId: text("wa_message_id"),
  status: text("status").notNull().default("received"),
  errorMessage: text("error_message"),
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  kind: text("kind").$type<"open" | "won" | "lost">().notNull().default("open"),
});

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  conversationId: uuid("conversation_id"),
  pipelineId: uuid("pipeline_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  title: text("title").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }),
  product: text("product"),
  ownerId: uuid("owner_id"),
  source: text("source"),
  utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  lostReason: text("lost_reason"),
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealEvents = pgTable("deal_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  dealId: uuid("deal_id").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FormField = {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea";
  required: boolean;
};

export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  fields: jsonb("fields").$type<FormField[]>().notNull().default([]),
  buttonLabel: text("button_label").notNull().default("Enviar"),
  successMessage: text("success_message").notNull(),
  showWhatsappCta: boolean("show_whatsapp_cta").notNull().default(true),
  consentText: text("consent_text"),
  pipelineId: uuid("pipeline_id"),
  stageId: uuid("stage_id"),
  distribute: boolean("distribute").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  formId: uuid("form_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
  contactId: uuid("contact_id"),
  dealId: uuid("deal_id"),
  waCtaClickedAt: timestamp("wa_cta_clicked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inboundWebhooks = pgTable("inbound_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  type: text("type").$type<"google_ads" | "wordpress" | "generic" | "meta_leadgen">().notNull(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  secretEnc: text("secret_enc"),
  fieldMap: jsonb("field_map").$type<Record<string, string>>().notNull().default({}),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  lastPayload: jsonb("last_payload").$type<Record<string, unknown> | null>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  webhookId: uuid("webhook_id"),
  source: text("source").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("received"),
  error: text("error"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadRoutingRules = pgTable("lead_routing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  source: text("source"),
  mode: text("mode").$type<"round_robin" | "fixed" | "unassigned">().notNull().default("round_robin"),
  fixedUserId: uuid("fixed_user_id"),
  lastAssignedUserId: uuid("last_assigned_user_id"),
  active: boolean("active").notNull().default(true),
});

export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  shortcut: text("shortcut").notNull(),
  body: text("body").notNull(),
});

export const waTemplates = pgTable("wa_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  language: text("language").notNull().default("pt_BR"),
  category: text("category").notNull().default("MARKETING"),
  status: text("status").notNull().default("PENDING"),
  body: text("body").notNull(),
  components: jsonb("components").$type<unknown[]>().notNull().default([]),
  waTemplateId: text("wa_template_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
