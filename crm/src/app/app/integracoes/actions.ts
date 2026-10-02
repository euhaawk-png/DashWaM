"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import { inboundWebhooks, jobs, publicEndpoints, webhookEvents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guard";
import { encryptSecret, randomToken } from "@/lib/crypto";
import { createLeadFromHook } from "@/lib/hooks";

export type HookActionState = { error?: string; ok?: boolean; message?: string };

export async function createWebhookAction(
  _prev: HookActionState,
  formData: FormData
): Promise<HookActionState> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({
      type: z.enum(["google_ads", "wordpress", "generic", "meta_leadgen"]),
      name: z.string().min(2).max(120),
      pageId: z.string().max(50).optional(),
      pageToken: z.string().max(500).optional(),
    })
    .safeParse({
      type: formData.get("type"),
      name: formData.get("name"),
      pageId: formData.get("pageId") || undefined,
      pageToken: formData.get("pageToken") || undefined,
    });
  if (!parsed.success) return { error: "Dados inválidos." };
  if (parsed.data.type === "meta_leadgen") {
    if (process.env.META_LEADGEN_ENABLED !== "true") {
      return { error: "O conector Meta Lead Ads ainda não está habilitado na plataforma." };
    }
    if (!parsed.data.pageId || !parsed.data.pageToken) {
      return { error: "Informe o ID da Página e o token de acesso da Página." };
    }
  }

  const token = randomToken(18);
  const secret = parsed.data.type === "meta_leadgen" ? parsed.data.pageToken! : randomToken(18);

  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      await tx.insert(inboundWebhooks).values({
        tenantId: ctx.tenant.id,
        type: parsed.data.type,
        name: parsed.data.name,
        token,
        secretEnc: encryptSecret(secret),
        meta: parsed.data.type === "meta_leadgen" ? { pageId: parsed.data.pageId } : {},
      });
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "webhook_create",
        data: { type: parsed.data.type, name: parsed.data.name },
      });
    },
    { userId: ctx.user.id }
  );
  if (parsed.data.type === "meta_leadgen" && parsed.data.pageId) {
    await db
      .insert(publicEndpoints)
      .values({ kind: "meta_page", key: parsed.data.pageId, tenantId: ctx.tenant.id })
      .onConflictDoNothing();
  }
  revalidatePath("/app/integracoes");
  return {
    ok: true,
    message:
      parsed.data.type === "meta_leadgen"
        ? "Conector Meta criado."
        : `Conexão criada. Chave secreta (guarde agora, ela fica criptografada): ${secret}`,
  };
}

export async function toggleWebhookAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const id = z.string().uuid().parse(formData.get("id"));
  const active = formData.get("active") === "true";
  await withTenant(ctx.tenant.id, (tx) =>
    tx.update(inboundWebhooks).set({ active }).where(eq(inboundWebhooks.id, id))
  );
  revalidatePath("/app/integracoes");
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const id = z.string().uuid().parse(formData.get("id"));
  await withTenant(ctx.tenant.id, async (tx) => {
    await tx.delete(inboundWebhooks).where(eq(inboundWebhooks.id, id));
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "webhook_delete", entityId: id });
  });
  revalidatePath("/app/integracoes");
}

export async function saveFieldMapAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const id = z.string().uuid().parse(formData.get("id"));
  const map: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("map:") && typeof value === "string" && value) {
      map[key.slice(4)] = value;
    }
  }
  await withTenant(ctx.tenant.id, (tx) =>
    tx.update(inboundWebhooks).set({ fieldMap: map }).where(eq(inboundWebhooks.id, id))
  );
  revalidatePath(`/app/integracoes/${id}`);
}

export async function reprocessEventAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const event = (
        await tx
          .select()
          .from(webhookEvents)
          .where(and(eq(webhookEvents.tenantId, ctx.tenant.id), eq(webhookEvents.id, eventId)))
          .limit(1)
      )[0];
      if (!event) return;
      if (event.source === "meta_leadgen") {
        const payload = event.payload as { leadgen_id?: string; page_id?: string };
        await tx.insert(jobs).values({
          tenantId: ctx.tenant.id,
          type: "fetch_leadgen",
          payload: { leadgenId: payload.leadgen_id, pageId: payload.page_id, webhookEventId: event.id },
        });
        return;
      }
      if (!event.webhookId) return;
      const webhook = (
        await tx.select().from(inboundWebhooks).where(eq(inboundWebhooks.id, event.webhookId)).limit(1)
      )[0];
      if (!webhook) return;
      try {
        await createLeadFromHook(tx, ctx.tenant.id, webhook, event.payload);
        await tx
          .update(webhookEvents)
          .set({ status: "processed", processedAt: new Date(), error: null })
          .where(eq(webhookEvents.id, event.id));
      } catch (err) {
        await tx
          .update(webhookEvents)
          .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
          .where(eq(webhookEvents.id, event.id));
      }
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/integracoes");
}
