import { and, eq, sql } from "drizzle-orm";
import { db, withTenant, type Tx } from "@/db";
import {
  contacts,
  conversations,
  inboundWebhooks,
  jobs,
  memberships,
  notifications,
  webhookEvents,
} from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { createLeadFromHook } from "@/lib/hooks";
import { ensureContact, createLead } from "@/lib/leads";
import { fetchLeadgenLead } from "@/lib/whatsapp/client";
import { normalizePhone } from "@/lib/phone";
import {
  processInboundMessages,
  processStatuses,
  sendWelcomeMessage,
  type WaWebhookValue,
} from "@/lib/whatsapp/inbound";

type JobRow = typeof jobs.$inferSelect;

async function notifyManagers(tx: Tx, tenantId: string, input: { type: string; title: string; body: string; link?: string }) {
  const roles = await tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active")));
  for (const m of roles.filter((r) => r.role === "manager" || r.role === "owner")) {
    await tx.insert(notifications).values({ tenantId, userId: m.userId, ...input });
  }
}

async function handleJob(job: JobRow): Promise<void> {
  const tenantId = job.tenantId;
  if (!tenantId) return;
  const payload = job.payload as Record<string, string>;

  await withTenant(tenantId, async (tx) => {
    switch (job.type) {
      case "send_welcome": {
        await sendWelcomeMessage(tx, tenantId, payload.conversationId, payload.contactPhone);
        break;
      }
      case "first_response_check": {
        const conversation = (
          await tx.select().from(conversations).where(eq(conversations.id, payload.conversationId)).limit(1)
        )[0];
        if (!conversation || conversation.firstResponseAt || conversation.status === "closed") break;
        const contact = (
          await tx.select().from(contacts).where(eq(contacts.id, conversation.contactId)).limit(1)
        )[0];
        await notifyManagers(tx, tenantId, {
          type: "slow_first_response",
          title: "Conversa sem primeira resposta",
          body: `${contact?.name ?? contact?.phone ?? "Um contato"} ainda não foi atendido.`,
          link: `/app/inbox?c=${conversation.id}`,
        });
        break;
      }
      case "reprocess_wa_event": {
        const event = (
          await tx.select().from(webhookEvents).where(eq(webhookEvents.id, payload.webhookEventId)).limit(1)
        )[0];
        if (!event || event.status === "processed") break;
        const value = event.payload as WaWebhookValue;
        await processInboundMessages(tx, tenantId, value);
        await processStatuses(tx, tenantId, value);
        await tx
          .update(webhookEvents)
          .set({ status: "processed", processedAt: new Date(), error: null })
          .where(eq(webhookEvents.id, event.id));
        break;
      }
      case "reprocess_hook_event": {
        const event = (
          await tx.select().from(webhookEvents).where(eq(webhookEvents.id, payload.webhookEventId)).limit(1)
        )[0];
        if (!event || event.status === "processed" || !event.webhookId) break;
        const webhook = (
          await tx.select().from(inboundWebhooks).where(eq(inboundWebhooks.id, event.webhookId)).limit(1)
        )[0];
        if (!webhook) break;
        await createLeadFromHook(tx, tenantId, webhook, event.payload);
        await tx
          .update(webhookEvents)
          .set({ status: "processed", processedAt: new Date(), error: null })
          .where(eq(webhookEvents.id, event.id));
        break;
      }
      case "fetch_leadgen": {
        // Stage 2 of Meta Lead Ads: fetch the person's data via Graph API.
        const connector = (
          await tx
            .select()
            .from(inboundWebhooks)
            .where(and(eq(inboundWebhooks.tenantId, tenantId), eq(inboundWebhooks.type, "meta_leadgen")))
            .limit(1)
        )[0];
        if (!connector?.secretEnc) throw new Error("Conector Meta sem token da Página.");
        const pageToken = decryptSecret(connector.secretEnc);
        const lead = await fetchLeadgenLead(payload.leadgenId, pageToken);

        let name: string | null = null;
        let phone: string | null = null;
        let email: string | null = null;
        const extra: Record<string, unknown> = { leadgen_id: payload.leadgenId };
        for (const f of lead.field_data ?? []) {
          const value = f.values?.[0]?.trim();
          if (!value) continue;
          if (/full[_ ]?name|^name$|nome/i.test(f.name)) name = value;
          else if (/phone|telefone|whatsapp/i.test(f.name)) phone = normalizePhone(value);
          else if (/e-?mail/i.test(f.name)) email = value.toLowerCase();
          else extra[f.name] = value;
        }
        const contact = await ensureContact(tx, tenantId, { phone, name, email, source: "meta_ads", extra });
        const { deal } = await createLead(tx, tenantId, {
          contact,
          source: "meta_ads",
          utm: { ...(lead.ad_id ? { ad_id: String(lead.ad_id) } : {}) },
          reuseOpen: false,
        });
        if (deal.ownerId) {
          await tx.insert(notifications).values({
            tenantId,
            userId: deal.ownerId,
            type: "new_lead",
            title: "Novo lead do Meta Lead Ads",
            body: contact.name ?? contact.email ?? contact.phone ?? "Lead",
            link: `/app/pipeline/negociacao/${deal.id}`,
          });
        }
        if (payload.webhookEventId) {
          await tx
            .update(webhookEvents)
            .set({ status: "processed", processedAt: new Date(), error: null })
            .where(eq(webhookEvents.id, payload.webhookEventId));
        }
        break;
      }
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  });
}

/** Claims due jobs (SKIP LOCKED) and processes them with exponential backoff. */
export async function runDueJobs(limit = 20): Promise<{ processed: number; failed: number }> {
  const due = (await db.execute(sql`
    UPDATE jobs SET status = 'running'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_at <= now()
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `)) as unknown as Array<Record<string, unknown>>;

  let processed = 0;
  let failed = 0;
  for (const raw of due) {
    const job: JobRow = {
      id: raw.id as string,
      tenantId: raw.tenant_id as string | null,
      type: raw.type as string,
      payload: (raw.payload ?? {}) as Record<string, unknown>,
      status: raw.status as string,
      attempts: Number(raw.attempts),
      maxAttempts: Number(raw.max_attempts),
      runAt: new Date(raw.run_at as string),
      lastError: raw.last_error as string | null,
      createdAt: new Date(raw.created_at as string),
    };
    try {
      await handleJob(job);
      await db.update(jobs).set({ status: "done" }).where(eq(jobs.id, job.id));
      processed++;
    } catch (err) {
      const attempts = job.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = attempts >= job.maxAttempts;
      await db
        .update(jobs)
        .set({
          status: exhausted ? "failed" : "pending",
          attempts,
          lastError: message.slice(0, 500),
          runAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
        })
        .where(eq(jobs.id, job.id));
      failed++;
    }
  }
  return { processed, failed };
}

/** Housekeeping: session/rate-limit pruning, LGPD purge, silent-webhook alert. */
export async function runMaintenance(): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE expires_at < now()`);
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM jobs WHERE status = 'done' AND created_at < now() - interval '7 days'`);

  // LGPD: hard-purge contacts soft-deleted more than 30 days ago.
  const purgeable = (await db.execute(sql`
    SELECT id, tenant_id FROM contacts WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
  `)) as unknown as Array<{ id: string; tenant_id: string }>;
  for (const row of purgeable) {
    await withTenant(row.tenant_id, (tx) => tx.delete(contacts).where(eq(contacts.id, row.id)));
  }

  // Silent WhatsApp webhook detector: connected account with no events for 24h.
  const silent = (await db.execute(sql`
    SELECT id, tenant_id FROM whatsapp_accounts
    WHERE status = 'connected' AND last_webhook_at IS NOT NULL AND last_webhook_at < now() - interval '24 hours'
  `)) as unknown as Array<{ id: string; tenant_id: string }>;
  for (const account of silent) {
    await withTenant(account.tenant_id, async (tx) => {
      const already = (await tx.execute(sql`
        SELECT 1 FROM notifications
        WHERE tenant_id = ${account.tenant_id} AND type = 'wa_webhook_silent' AND created_at > now() - interval '24 hours'
        LIMIT 1
      `)) as unknown as unknown[];
      if (already.length > 0) return;
      await notifyManagers(tx, account.tenant_id, {
        type: "wa_webhook_silent",
        title: "WhatsApp sem receber mensagens há 24h",
        body: "Verifique a conexão do número em Configurações → WhatsApp.",
        link: "/app/configuracoes/whatsapp",
      });
    });
  }
}
