import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  conversations,
  jobs,
  messages,
  notifications,
  tenants,
  waTemplates,
  whatsappAccounts,
  type TenantSettings,
} from "@/db/schema";
import { createLead, ensureContact } from "@/lib/leads";
import { pickAssignee } from "@/lib/routing";
import { sendTextMessage } from "./client";

// --- Cloud API webhook payload types (the subset we consume) ---------------

export type WaWebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
};

export type WaWebhookStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  errors?: Array<{ title?: string; message?: string }>;
};

export type WaWebhookValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
  messages?: WaWebhookMessage[];
  statuses?: WaWebhookStatus[];
  // template status update payloads
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
};

function extractBody(msg: WaWebhookMessage): { body: string | null; mediaId: string | null; mime: string | null; type: string } {
  switch (msg.type) {
    case "text":
      return { body: msg.text?.body ?? "", mediaId: null, mime: null, type: "text" };
    case "image":
      return { body: msg.image?.caption ?? null, mediaId: msg.image?.id ?? null, mime: msg.image?.mime_type ?? null, type: "image" };
    case "audio":
      return { body: null, mediaId: msg.audio?.id ?? null, mime: msg.audio?.mime_type ?? null, type: "audio" };
    case "video":
      return { body: msg.video?.caption ?? null, mediaId: msg.video?.id ?? null, mime: msg.video?.mime_type ?? null, type: "video" };
    case "sticker":
      return { body: null, mediaId: msg.sticker?.id ?? null, mime: msg.sticker?.mime_type ?? null, type: "image" };
    case "document":
      return {
        body: msg.document?.caption ?? msg.document?.filename ?? null,
        mediaId: msg.document?.id ?? null,
        mime: msg.document?.mime_type ?? null,
        type: "document",
      };
    case "location": {
      const l = msg.location;
      const label = l ? `📍 ${l.name ?? ""} ${l.address ?? ""} (${l.latitude}, ${l.longitude})`.trim() : "📍 Localização";
      return { body: label, mediaId: null, mime: null, type: "location" };
    }
    case "button":
      return { body: msg.button?.text ?? null, mediaId: null, mime: null, type: "text" };
    case "interactive":
      return {
        body: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null,
        mediaId: null,
        mime: null,
        type: "text",
      };
    case "contacts":
      return { body: "🪪 Contato compartilhado", mediaId: null, mime: null, type: "contacts" };
    default:
      return { body: `[${msg.type}]`, mediaId: null, mime: null, type: msg.type };
  }
}

function previewOf(body: string | null, type: string): string {
  if (type === "image") return body ? `🖼 ${body}` : "🖼 Imagem";
  if (type === "audio") return "🎙 Áudio";
  if (type === "video") return body ? `🎬 ${body}` : "🎬 Vídeo";
  if (type === "document") return body ? `📄 ${body}` : "📄 Documento";
  return (body ?? "").slice(0, 120);
}

/**
 * Processes inbound messages for one tenant. Runs inside the tenant context.
 * Every new conversation auto-creates contact + deal (source "WhatsApp") and
 * runs lead routing; the assignee gets an in-app notification.
 */
export async function processInboundMessages(tx: Tx, tenantId: string, value: WaWebhookValue): Promise<void> {
  const account = (
    await tx
      .select()
      .from(whatsappAccounts)
      .where(and(eq(whatsappAccounts.tenantId, tenantId), eq(whatsappAccounts.phoneNumberId, value.metadata?.phone_number_id ?? "")))
      .limit(1)
  )[0];

  const tenant = (await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  const settings: TenantSettings = tenant?.settings ?? {};

  for (const msg of value.messages ?? []) {
    const phone = `+${msg.from.replace(/\D/g, "")}`;
    const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

    const contact = await ensureContact(tx, tenantId, {
      phone,
      name: profileName,
      source: "whatsapp",
    });

    // Upsert conversation (unique tenant+contact).
    let conversation = (
      await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.contactId, contact.id)))
        .limit(1)
    )[0];
    const isNewConversation = !conversation;
    if (!conversation) {
      const assignee = await pickAssignee(tx, tenantId, "whatsapp");
      [conversation] = await tx
        .insert(conversations)
        .values({ tenantId, contactId: contact.id, assignedTo: assignee })
        .returning();
      if (assignee) {
        await tx.insert(notifications).values({
          tenantId,
          userId: assignee,
          type: "new_conversation",
          title: "Nova conversa atribuída a você",
          body: `${contact.name ?? phone} iniciou uma conversa no WhatsApp.`,
          link: `/app/inbox?c=${conversation.id}`,
        });
      }
    }

    // Idempotency: skip messages already stored (webhook retries).
    const dupe = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.waMessageId, msg.id)))
      .limit(1);
    if (dupe[0]) continue;

    const { body, mediaId, mime, type } = extractBody(msg);
    const receivedAt = new Date(Number(msg.timestamp) * 1000 || Date.now());
    await tx.insert(messages).values({
      tenantId,
      conversationId: conversation.id,
      direction: "in",
      type,
      body,
      mediaId,
      mediaMime: mime,
      waMessageId: msg.id,
      status: "received",
      createdAt: receivedAt,
    });

    const reopen = conversation.status === "closed";
    await tx
      .update(conversations)
      .set({
        lastMessageAt: receivedAt,
        lastInboundAt: receivedAt,
        lastMessagePreview: previewOf(body, type),
        unreadCount: sql`${conversations.unreadCount} + 1`,
        ...(reopen ? { status: "open" as const } : {}),
      })
      .where(eq(conversations.id, conversation.id));

    // Every conversation keeps one live deal in the default pipeline.
    await createLead(tx, tenantId, {
      contact,
      source: "whatsapp",
      conversationId: conversation.id,
      reuseOpen: true,
    });

    if (isNewConversation) {
      // Optional automatic welcome message (inside the 24h window by definition).
      if (settings.welcomeMessage && account) {
        await tx.insert(jobs).values({
          tenantId,
          type: "send_welcome",
          payload: { conversationId: conversation.id, contactPhone: phone },
        });
      }
      // Slow first-response alert for the manager.
      if (settings.firstResponseAlertMinutes && settings.firstResponseAlertMinutes > 0) {
        await tx.insert(jobs).values({
          tenantId,
          type: "first_response_check",
          payload: { conversationId: conversation.id },
          runAt: new Date(Date.now() + settings.firstResponseAlertMinutes * 60_000),
        });
      }
    }
  }

  if (account && (value.messages?.length || value.statuses?.length)) {
    await tx
      .update(whatsappAccounts)
      .set({ lastWebhookAt: new Date(), status: "connected" })
      .where(eq(whatsappAccounts.id, account.id));
  }
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Applies delivery status updates (sent/delivered/read/failed). */
export async function processStatuses(tx: Tx, tenantId: string, value: WaWebhookValue): Promise<void> {
  for (const st of value.statuses ?? []) {
    const row = (
      await tx
        .select()
        .from(messages)
        .where(and(eq(messages.tenantId, tenantId), eq(messages.waMessageId, st.id)))
        .limit(1)
    )[0];
    if (!row) continue;
    // Never downgrade (e.g. a late "delivered" after "read").
    if (st.status !== "failed" && (STATUS_RANK[st.status] ?? 0) <= (STATUS_RANK[row.status] ?? 0)) continue;
    await tx
      .update(messages)
      .set({
        status: st.status,
        errorMessage: st.status === "failed" ? st.errors?.map((e) => e.message ?? e.title).join("; ") ?? "Falha no envio" : null,
      })
      .where(eq(messages.id, row.id));
  }
}

/** Syncs template approval status pushed by Meta. */
export async function processTemplateUpdate(tx: Tx, tenantId: string, value: WaWebhookValue): Promise<void> {
  if (!value.message_template_name || !value.event) return;
  await tx
    .update(waTemplates)
    .set({ status: value.event.toUpperCase() })
    .where(
      and(
        eq(waTemplates.tenantId, tenantId),
        eq(waTemplates.name, value.message_template_name),
        eq(waTemplates.language, value.message_template_language ?? "pt_BR")
      )
    );
}

/** Sends the configured welcome message (used by the job worker). */
export async function sendWelcomeMessage(tx: Tx, tenantId: string, conversationId: string, phone: string): Promise<void> {
  const tenant = (await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  const text = (tenant?.settings as TenantSettings | undefined)?.welcomeMessage;
  if (!text) return;
  const account = (
    await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, tenantId)).limit(1)
  )[0];
  if (!account || account.status !== "connected") return;
  const res = await sendTextMessage(account, phone, text);
  await tx.insert(messages).values({
    tenantId,
    conversationId,
    direction: "out",
    type: "text",
    body: text,
    waMessageId: res.messages?.[0]?.id ?? null,
    status: "sent",
  });
  await tx
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 120) })
    .where(eq(conversations.id, conversationId));
}
