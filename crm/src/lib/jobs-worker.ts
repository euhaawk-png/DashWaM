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
import { fetchLeadgenLead, listPageLeadForms, listRecentFormLeads } from "@/lib/whatsapp/client";
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

/** Shared mapper for Meta Lead Ads field_data → contact + deal + notification. */
async function createContactFromLeadgen(
  tx: Tx,
  tenantId: string,
  lead: { field_data?: Array<{ name: string; values: string[] }>; ad_id?: string },
  leadgenId: string
): Promise<void> {
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  const extra: Record<string, unknown> = { leadgen_id: leadgenId };
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
}

/** True when this leadgen id was already ingested (webhook or re-poll). */
async function leadgenAlreadyProcessed(tx: Tx, tenantId: string, leadgenId: string): Promise<boolean> {
  const rows = (await tx.execute(sql`
    SELECT 1 FROM webhook_events
    WHERE tenant_id = ${tenantId} AND source LIKE 'meta_leadgen%'
      AND payload->>'leadgen_id' = ${leadgenId} AND status = 'processed'
    LIMIT 1
  `)) as unknown as unknown[];
  return rows.length > 0;
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
        if (!(await leadgenAlreadyProcessed(tx, tenantId, payload.leadgenId))) {
          await createContactFromLeadgen(tx, tenantId, lead, payload.leadgenId);
        }
        if (payload.webhookEventId) {
          await tx
            .update(webhookEvents)
            .set({ status: "processed", processedAt: new Date(), error: null })
            .where(eq(webhookEvents.id, payload.webhookEventId));
        }
        break;
      }
      case "leadgen_repoll": {
        // Recovery routine: periodically re-polls the connected Page's forms so
        // leads are not lost if the webhook endpoint was down at notify time.
        if (process.env.META_LEADGEN_ENABLED !== "true") break;
        const connector = (
          await tx
            .select()
            .from(inboundWebhooks)
            .where(
              and(
                eq(inboundWebhooks.tenantId, tenantId),
                eq(inboundWebhooks.type, "meta_leadgen"),
                eq(inboundWebhooks.active, true)
              )
            )
            .limit(1)
        )[0];
        if (!connector?.secretEnc) break;
        const pageId = String((connector.meta as { pageId?: string }).pageId ?? "");
        if (!pageId) break;
        const pageToken = decryptSecret(connector.secretEnc);
        const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        const forms = await listPageLeadForms(pageId, pageToken);
        let recovered = 0;
        for (const form of forms) {
          const leads = await listRecentFormLeads(form.id, pageToken, since);
          for (const lead of leads) {
            if (await leadgenAlreadyProcessed(tx, tenantId, lead.id)) continue;
            await createContactFromLeadgen(tx, tenantId, lead, lead.id);
            await tx.insert(webhookEvents).values({
              tenantId,
              webhookId: connector.id,
              source: "meta_leadgen_repoll",
              payload: { leadgen_id: lead.id, form_id: form.id, recovered: true },
              status: "processed",
              processedAt: new Date(),
            });
            recovered++;
          }
        }
        if (recovered > 0) console.info(`[leadgen_repoll] tenant recovered ${recovered} lead(s)`);
        // Self-perpetuating: schedule the next poll in 6 hours.
        await tx.insert(jobs).values({
          tenantId,
          type: "leadgen_repoll",
          payload: {},
          runAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        });
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

/**
 * Housekeeping. Tenant-scoped scans MUST run inside each tenant's RLS context
 * (a global query as crm_app sees zero rows on RLS tables), so we iterate the
 * active tenants (global table) and open a context per tenant.
 */
export async function runMaintenance(): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE expires_at < now()`);
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM jobs WHERE status = 'done' AND created_at < now() - interval '7 days'`);

  const activeTenants = (await db.execute(sql`SELECT id FROM tenants WHERE status = 'active'`)) as unknown as Array<{
    id: string;
  }>;

  for (const tenant of activeTenants) {
    await withTenant(tenant.id, async (tx) => {
      // LGPD: hard-purge contacts soft-deleted more than 30 days ago.
      await tx.execute(sql`
        DELETE FROM contacts
        WHERE tenant_id = ${tenant.id} AND deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
      `);

      // Silent WhatsApp webhook detector: connected number, no events for 24h.
      const silent = (await tx.execute(sql`
        SELECT id FROM whatsapp_accounts
        WHERE tenant_id = ${tenant.id} AND status = 'connected'
          AND last_webhook_at IS NOT NULL AND last_webhook_at < now() - interval '24 hours'
      `)) as unknown as unknown[];
      if (silent.length > 0) {
        const already = (await tx.execute(sql`
          SELECT 1 FROM notifications
          WHERE tenant_id = ${tenant.id} AND type = 'wa_webhook_silent' AND created_at > now() - interval '24 hours'
          LIMIT 1
        `)) as unknown as unknown[];
        if (already.length === 0) {
          await notifyManagers(tx, tenant.id, {
            type: "wa_webhook_silent",
            title: "WhatsApp sem receber mensagens há 24h",
            body: "Verifique a conexão do número em Configurações → WhatsApp.",
            link: "/app/configuracoes/whatsapp",
          });
        }
      }

      // Meta Lead Ads recovery: keep one re-poll job alive per tenant with an
      // active connector (the job then re-arms itself every 6 hours).
      if (process.env.META_LEADGEN_ENABLED === "true") {
        const connector = (await tx.execute(sql`
          SELECT 1 FROM inbound_webhooks
          WHERE tenant_id = ${tenant.id} AND type = 'meta_leadgen' AND active = true
          LIMIT 1
        `)) as unknown as unknown[];
        if (connector.length > 0) {
          const pending = (await tx.execute(sql`
            SELECT 1 FROM jobs
            WHERE tenant_id = ${tenant.id} AND type = 'leadgen_repoll' AND status IN ('pending', 'running')
            LIMIT 1
          `)) as unknown as unknown[];
          if (pending.length === 0) {
            await tx.insert(jobs).values({ tenantId: tenant.id, type: "leadgen_repoll", payload: {} });
          }
        }
      }
    });
  }
}
