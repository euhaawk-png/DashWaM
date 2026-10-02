import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { contacts, dealEvents, deals, pipelines, stages } from "@/db/schema";
import { pickAssignee } from "./routing";

export type ContactRow = typeof contacts.$inferSelect;
export type DealRow = typeof deals.$inferSelect;

/** Finds or creates a contact by phone (or email when no phone). */
export async function ensureContact(
  tx: Tx,
  tenantId: string,
  input: { phone?: string | null; name?: string | null; email?: string | null; source?: string; extra?: Record<string, unknown> }
): Promise<ContactRow> {
  let existing: ContactRow | undefined;
  if (input.phone) {
    existing = (
      await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, input.phone), isNull(contacts.deletedAt)))
        .limit(1)
    )[0];
  } else if (input.email) {
    existing = (
      await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, input.email), isNull(contacts.deletedAt)))
        .limit(1)
    )[0];
  }
  if (existing) {
    // Fill gaps without overwriting user-entered data.
    const patch: Partial<typeof contacts.$inferInsert> = {};
    if (!existing.name && input.name) patch.name = input.name;
    if (!existing.email && input.email) patch.email = input.email;
    if (Object.keys(patch).length > 0) {
      await tx.update(contacts).set(patch).where(eq(contacts.id, existing.id));
      return { ...existing, ...patch } as ContactRow;
    }
    return existing;
  }
  const [created] = await tx
    .insert(contacts)
    .values({
      tenantId,
      phone: input.phone ?? null,
      name: input.name ?? null,
      email: input.email ?? null,
      source: input.source ?? null,
      extra: input.extra ?? {},
    })
    .returning();
  return created;
}

export async function defaultPipelineAndStage(
  tx: Tx,
  tenantId: string,
  overrides?: { pipelineId?: string | null; stageId?: string | null }
): Promise<{ pipelineId: string; stageId: string }> {
  if (overrides?.pipelineId && overrides.stageId) {
    return { pipelineId: overrides.pipelineId, stageId: overrides.stageId };
  }
  const pipeline =
    (overrides?.pipelineId
      ? (await tx.select().from(pipelines).where(eq(pipelines.id, overrides.pipelineId)).limit(1))[0]
      : undefined) ??
    (
      await tx
        .select()
        .from(pipelines)
        .where(and(eq(pipelines.tenantId, tenantId), eq(pipelines.isDefault, true)))
        .limit(1)
    )[0] ??
    (await tx.select().from(pipelines).where(eq(pipelines.tenantId, tenantId)).limit(1))[0];
  if (!pipeline) throw new Error("Tenant has no pipeline");
  const stageRows = await tx
    .select()
    .from(stages)
    .where(and(eq(stages.pipelineId, pipeline.id), eq(stages.kind, "open")));
  stageRows.sort((a, b) => a.position - b.position);
  const stage = stageRows[0];
  if (!stage) throw new Error("Pipeline has no open stage");
  return { pipelineId: pipeline.id, stageId: stage.id };
}

/**
 * Creates a deal for a contact, running lead routing to pick the owner.
 * Reuses an existing open deal for the same contact when `reuseOpen` is set
 * (WhatsApp flow: one live deal per conversation).
 */
export async function createLead(
  tx: Tx,
  tenantId: string,
  input: {
    contact: ContactRow;
    source: string;
    conversationId?: string | null;
    utm?: Record<string, string>;
    pipelineId?: string | null;
    stageId?: string | null;
    distribute?: boolean;
    reuseOpen?: boolean;
  }
): Promise<{ deal: DealRow; created: boolean }> {
  if (input.reuseOpen) {
    const open = (
      await tx
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, tenantId),
            eq(deals.contactId, input.contact.id),
            isNull(deals.wonAt),
            isNull(deals.lostAt)
          )
        )
        .limit(1)
    )[0];
    if (open) return { deal: open, created: false };
  }

  const { pipelineId, stageId } = await defaultPipelineAndStage(tx, tenantId, input);
  const ownerId = input.distribute === false ? null : await pickAssignee(tx, tenantId, input.source);
  const [deal] = await tx
    .insert(deals)
    .values({
      tenantId,
      contactId: input.contact.id,
      conversationId: input.conversationId ?? null,
      pipelineId,
      stageId,
      title: input.contact.name || input.contact.phone || input.contact.email || "Novo lead",
      ownerId,
      source: input.source,
      utm: input.utm ?? {},
    })
    .returning();
  await tx.insert(dealEvents).values({
    tenantId,
    dealId: deal.id,
    type: "created",
    data: { source: input.source, ownerId },
  });
  return { deal, created: true };
}
