import { decryptSecret } from "@/lib/crypto";
import type { whatsappAccounts } from "@/db/schema";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;

type WaAccount = typeof whatsappAccounts.$inferSelect;

export class WaApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown
  ) {
    super(`WhatsApp API error ${status}`);
  }
}

async function graphFetch(path: string, token: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new WaApiError(res.status, json);
  return json;
}

export function accountToken(account: Pick<WaAccount, "accessTokenEnc">): string {
  return decryptSecret(account.accessTokenEnc);
}

// ------------------------------------------------------------- messaging ---

export async function sendTextMessage(account: WaAccount, toE164: string, body: string) {
  return graphFetch(`/${account.phoneNumberId}/messages`, accountToken(account), {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "text",
      text: { body, preview_url: true },
    }),
  }) as Promise<{ messages?: Array<{ id: string }> }>;
}

export async function sendTemplateMessage(
  account: WaAccount,
  toE164: string,
  templateName: string,
  language: string,
  components?: unknown[]
) {
  return graphFetch(`/${account.phoneNumberId}/messages`, accountToken(account), {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: { name: templateName, language: { code: language }, ...(components ? { components } : {}) },
    }),
  }) as Promise<{ messages?: Array<{ id: string }> }>;
}

export async function markMessageRead(account: WaAccount, waMessageId: string) {
  return graphFetch(`/${account.phoneNumberId}/messages`, accountToken(account), {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: waMessageId }),
  }).catch(() => ({}));
}

// ----------------------------------------------------------------- media ---

export async function getMediaMeta(account: WaAccount, mediaId: string) {
  return graphFetch(`/${mediaId}`, accountToken(account)) as Promise<{
    url?: string;
    mime_type?: string;
    file_size?: number;
  }>;
}

export async function downloadMedia(account: WaAccount, mediaId: string): Promise<Response> {
  const meta = await getMediaMeta(account, mediaId);
  if (!meta.url) throw new WaApiError(404, { error: "media url missing" });
  return fetch(meta.url, { headers: { Authorization: `Bearer ${accountToken(account)}` } });
}

// ----------------------------------------------------- account / signup ----

/** Exchanges the Embedded Signup auth code for a business token. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    code,
  });
  const res = await fetch(`${GRAPH()}/oauth/access_token?${params}`);
  const json = (await res.json()) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new WaApiError(res.status, json);
  return json.access_token;
}

/** Subscribes our app to the customer's WABA webhooks. */
export async function subscribeAppToWaba(wabaId: string, token: string) {
  return graphFetch(`/${wabaId}/subscribed_apps`, token, { method: "POST" });
}

/** Registers the phone number for Cloud API messaging. */
export async function registerPhoneNumber(phoneNumberId: string, token: string, pin = "000000") {
  return graphFetch(`/${phoneNumberId}/register`, token, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  }).catch((err) => {
    // Already registered is fine.
    if (err instanceof WaApiError && err.status === 400) return {};
    throw err;
  });
}

export async function fetchPhoneNumberInfo(phoneNumberId: string, token: string) {
  return graphFetch(
    `/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    token
  ) as Promise<{
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    messaging_limit_tier?: string;
  }>;
}

// ------------------------------------------------------------- templates ---

export async function createRemoteTemplate(
  account: WaAccount,
  input: { name: string; language: string; category: string; bodyText: string }
) {
  return graphFetch(`/${account.wabaId}/message_templates`, accountToken(account), {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: [{ type: "BODY", text: input.bodyText }],
    }),
  }) as Promise<{ id?: string; status?: string }>;
}

export async function listRemoteTemplates(account: WaAccount) {
  return graphFetch(
    `/${account.wabaId}/message_templates?fields=name,language,status,category&limit=100`,
    accountToken(account)
  ) as Promise<{ data?: Array<{ name: string; language: string; status: string; category: string }> }>;
}

/** Fetches a Lead Ads lead by id (requires leads_retrieval; page token). */
export async function fetchLeadgenLead(leadgenId: string, pageToken: string) {
  const res = await fetch(`${GRAPH()}/${leadgenId}`, {
    headers: { Authorization: `Bearer ${pageToken}` },
  });
  const json = (await res.json()) as {
    field_data?: Array<{ name: string; values: string[] }>;
    ad_id?: string;
    campaign_name?: string;
    created_time?: string;
  };
  if (!res.ok) throw new WaApiError(res.status, json);
  return json;
}

/** Lists the lead forms of a connected Page (re-poll recovery routine). */
export async function listPageLeadForms(pageId: string, pageToken: string) {
  const res = await fetch(`${GRAPH()}/${pageId}/leadgen_forms?fields=id,name&limit=50`, {
    headers: { Authorization: `Bearer ${pageToken}` },
  });
  const json = (await res.json()) as { data?: Array<{ id: string; name?: string }> };
  if (!res.ok) throw new WaApiError(res.status, json);
  return json.data ?? [];
}

/** Lists a form's recent leads since a unix timestamp (recovery re-poll). */
export async function listRecentFormLeads(formId: string, pageToken: string, sinceUnix: number) {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }])
  );
  const res = await fetch(
    `${GRAPH()}/${formId}/leads?fields=id,created_time,field_data,ad_id&limit=100&filtering=${filtering}`,
    { headers: { Authorization: `Bearer ${pageToken}` } }
  );
  const json = (await res.json()) as {
    data?: Array<{ id: string; field_data?: Array<{ name: string; values: string[] }>; ad_id?: string }>;
  };
  if (!res.ok) throw new WaApiError(res.status, json);
  return json.data ?? [];
}
