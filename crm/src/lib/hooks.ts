import type { Tx } from "@/db";
import { inboundWebhooks, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createLead, ensureContact } from "./leads";
import { normalizePhone } from "./phone";

type Webhook = typeof inboundWebhooks.$inferSelect;

export type GoogleLeadPayload = {
  lead_id?: string;
  api_version?: string;
  form_id?: number | string;
  campaign_id?: number | string;
  is_test?: boolean;
  gcl_id?: string;
  user_column_data?: Array<{ column_id?: string; column_name?: string; string_value?: string }>;
};

/** Extracts contact fields from a Google Ads Lead Form webhook payload. */
function parseGoogleLead(payload: GoogleLeadPayload) {
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  const extra: Record<string, unknown> = {};
  for (const col of payload.user_column_data ?? []) {
    const value = col.string_value?.trim();
    if (!value) continue;
    switch (col.column_id) {
      case "FULL_NAME":
        name = value;
        break;
      case "PHONE_NUMBER":
        phone = normalizePhone(value);
        break;
      case "EMAIL":
        email = value.toLowerCase();
        break;
      default:
        extra[col.column_name ?? col.column_id ?? "campo"] = value;
    }
  }
  return { name, phone, email, extra };
}

/** Applies a saved field map ({payloadKey: name|phone|email|extra}) to a flat payload. */
function applyFieldMap(payload: Record<string, unknown>, fieldMap: Record<string, string>) {
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  const extra: Record<string, unknown> = {};

  const entries = Object.entries(payload).filter(([, v]) => typeof v === "string" || typeof v === "number");
  const mapped = Object.keys(fieldMap).length > 0;
  for (const [key, raw] of entries) {
    const value = String(raw).trim();
    if (!value) continue;
    const target = mapped
      ? fieldMap[key]
      : /^(nome|name|full_?name|your-name)$/i.test(key)
        ? "name"
        : /(phone|telefone|celular|whatsapp|tel)/i.test(key)
          ? "phone"
          : /e-?mail/i.test(key)
            ? "email"
            : "extra";
    switch (target) {
      case "name":
        name = value;
        break;
      case "phone":
        phone = normalizePhone(value) ?? phone;
        break;
      case "email":
        email = value.toLowerCase();
        break;
      case "ignore":
        break;
      default:
        extra[key] = value;
    }
  }
  return { name, phone, email, extra };
}

const SOURCE_BY_TYPE: Record<Webhook["type"], string> = {
  google_ads: "google_ads",
  wordpress: "wordpress",
  generic: "webhook",
  meta_leadgen: "meta_ads",
};

/**
 * Creates contact + deal from an inbound webhook payload. Runs inside the
 * tenant context. Returns the created ids (used by the event log).
 */
export async function createLeadFromHook(
  tx: Tx,
  tenantId: string,
  webhook: Webhook,
  payload: Record<string, unknown>
): Promise<{ contactId: string; dealId: string }> {
  let parsed: { name: string | null; phone: string | null; email: string | null; extra: Record<string, unknown> };
  const utm: Record<string, string> = {};

  if (webhook.type === "google_ads") {
    const g = payload as GoogleLeadPayload;
    parsed = parseGoogleLead(g);
    if (g.campaign_id) utm.campaign_id = String(g.campaign_id);
    if (g.form_id) utm.form_id = String(g.form_id);
    if (g.gcl_id) utm.gclid = String(g.gcl_id);
    if (g.is_test) parsed.extra.is_test = true;
  } else {
    parsed = applyFieldMap(payload, webhook.fieldMap);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = payload[k];
      if (typeof v === "string" && v) utm[k] = v;
    }
  }

  if (!parsed.phone && !parsed.email && !parsed.name) {
    throw new Error("Payload sem nome, telefone ou e-mail — configure o mapeamento de campos.");
  }

  const source = SOURCE_BY_TYPE[webhook.type];
  const contact = await ensureContact(tx, tenantId, {
    phone: parsed.phone,
    name: parsed.name,
    email: parsed.email,
    source,
    extra: parsed.extra,
  });
  const { deal } = await createLead(tx, tenantId, {
    contact,
    source,
    utm,
    reuseOpen: false,
  });
  if (deal.ownerId) {
    await tx.insert(notifications).values({
      tenantId,
      userId: deal.ownerId,
      type: "new_lead",
      title: "Novo lead recebido",
      body: `${contact.name ?? contact.phone ?? contact.email ?? "Lead"} — ${webhook.name}`,
      link: `/app/pipeline/negociacao/${deal.id}`,
    });
  }
  // Keep the latest payload for the mapping screen.
  await tx.update(inboundWebhooks).set({ lastPayload: payload }).where(eq(inboundWebhooks.id, webhook.id));
  return { contactId: contact.id, dealId: deal.id };
}
