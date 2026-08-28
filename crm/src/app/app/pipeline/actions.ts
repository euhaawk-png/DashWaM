"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { contacts, conversations, dealEvents, deals } from "@/db/schema";
import { requireTenant } from "@/lib/auth/guard";
import { isManager } from "@/lib/inbox";
import { normalizePhone } from "@/lib/phone";
import { createLead, ensureContact } from "@/lib/leads";
import { audit } from "@/lib/audit";

export type PipelineActionState = { error?: string; ok?: boolean; message?: string };

async function accessibleDeal(tenantId: string, userId: string, manager: boolean, dealId: string) {
  return withTenant(
    tenantId,
    async (tx) => {
      const deal = (
        await tx
          .select()
          .from(deals)
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId)))
          .limit(1)
      )[0];
      if (!deal) return null;
      if (!manager && deal.ownerId !== userId) return null;
      return deal;
    },
    { userId }
  );
}

/** "Abrir conversa" / "Chamar no WhatsApp": ensures a conversation exists for
 *  the deal's contact and lands the user in the inbox (template composer shows
 *  automatically when the 24h window is closed). */
export async function openConversationAction(formData: FormData): Promise<void> {
  const ctx = await requireTenant();
  const dealId = z.string().uuid().parse(formData.get("dealId"));
  const manager = isManager(ctx);
  const deal = await accessibleDeal(ctx.tenant.id, ctx.user.id, manager, dealId);
  if (!deal) redirect("/app/pipeline");

  const conversationId = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      let conversation = (
        await tx
          .select()
          .from(conversations)
          .where(and(eq(conversations.tenantId, ctx.tenant.id), eq(conversations.contactId, deal.contactId)))
          .limit(1)
      )[0];
      if (!conversation) {
        [conversation] = await tx
          .insert(conversations)
          .values({
            tenantId: ctx.tenant.id,
            contactId: deal.contactId,
            assignedTo: deal.ownerId ?? ctx.user.id,
          })
          .returning();
        await tx.update(deals).set({ conversationId: conversation.id }).where(eq(deals.id, deal.id));
      }
      return conversation.id;
    },
    { userId: ctx.user.id }
  );
  redirect(`/app/inbox?c=${conversationId}`);
}

export async function addDealNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireTenant();
  const parsed = z
    .object({ dealId: z.string().uuid(), note: z.string().min(1).max(2000) })
    .parse({ dealId: formData.get("dealId"), note: formData.get("note") });
  const deal = await accessibleDeal(ctx.tenant.id, ctx.user.id, isManager(ctx), parsed.dealId);
  if (!deal) return;
  await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx.insert(dealEvents).values({
        tenantId: ctx.tenant.id,
        dealId: parsed.dealId,
        type: "note",
        data: { text: parsed.note },
        userId: ctx.user.id,
      }),
    { userId: ctx.user.id }
  );
  revalidatePath(`/app/pipeline/negociacao/${parsed.dealId}`);
}

/** Manual lead creation (sellers included). */
export async function createManualLeadAction(
  _prev: PipelineActionState,
  formData: FormData
): Promise<PipelineActionState> {
  const ctx = await requireTenant();
  const parsed = z
    .object({
      name: z.string().min(1).max(200),
      phone: z.string().max(30).optional(),
      email: z.string().email().max(200).optional().or(z.literal("")),
      value: z.coerce.number().min(0).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos." };
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return { error: "Telefone inválido. Use DDD + número." };

  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const contact = await ensureContact(tx, ctx.tenant.id, {
        phone,
        name: parsed.data.name,
        email: parsed.data.email || null,
        source: "manual",
      });
      const { deal } = await createLead(tx, ctx.tenant.id, {
        contact,
        source: "manual",
        distribute: false,
        reuseOpen: false,
      });
      await tx
        .update(deals)
        .set({
          ownerId: ctx.user.id,
          ...(parsed.data.value ? { value: String(parsed.data.value) } : {}),
        })
        .where(eq(deals.id, deal.id));
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "lead_create_manual",
        entity: "deal",
        entityId: deal.id,
      });
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/pipeline");
  return { ok: true, message: "Lead criado." };
}

/** LGPD: soft delete + scheduled purge of a contact (owner only). */
export async function deleteContactAction(formData: FormData): Promise<void> {
  const ctx = await requireTenant();
  if (ctx.role !== "owner") return;
  const contactId = z.string().uuid().parse(formData.get("contactId"));
  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      await tx
        .update(contacts)
        .set({ deletedAt: new Date(), name: null, email: null, extra: {} })
        .where(and(eq(contacts.tenantId, ctx.tenant.id), eq(contacts.id, contactId)));
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "contact_delete_lgpd",
        entity: "contact",
        entityId: contactId,
      });
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/contatos");
}
