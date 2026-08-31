"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant, type Tx } from "@/db";
import {
  deals,
  leadRoutingRules,
  memberships,
  pipelines,
  quickReplies,
  stages,
  tenants,
  users,
  waTemplates,
  whatsappAccounts,
  type TenantSettings,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { requireRole, requireTenant } from "@/lib/auth/guard";
import { destroyAllSessions, getSession, setSessionCookie, createSession } from "@/lib/auth/session";
import { createInvitation } from "@/lib/invites";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { createRemoteTemplate, fetchPhoneNumberInfo, listRemoteTemplates, accountToken } from "@/lib/whatsapp/client";
import { brand } from "@/config/brand";

export type SettingsActionState = { error?: string; ok?: boolean; message?: string };

// ------------------------------------------------------------ company ------

export async function updateCompanySettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({
      name: z.string().min(2).max(120),
      welcomeMessage: z.string().max(1000).optional(),
      firstResponseAlertMinutes: z.coerce.number().int().min(0).max(1440).optional(),
      require2fa: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos." };

  const settings: TenantSettings = {
    ...ctx.tenant.settings,
    welcomeMessage: parsed.data.welcomeMessage?.trim() || null,
    firstResponseAlertMinutes: parsed.data.firstResponseAlertMinutes || null,
    require2fa: parsed.data.require2fa === "on",
  };
  await db.update(tenants).set({ name: parsed.data.name, settings }).where(eq(tenants.id, ctx.tenant.id));
  await withTenant(ctx.tenant.id, (tx) =>
    audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "settings_update" })
  );
  revalidatePath("/app/configuracoes");
  return { ok: true, message: "Configurações salvas." };
}

// --------------------------------------------------------------- team ------

export async function inviteUserAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({ email: z.string().email().max(200), role: z.enum(["owner", "manager", "seller"]) })
    .safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: "E-mail ou papel inválido." };
  const inviteUrl = await createInvitation({
    tenantId: ctx.tenant.id,
    tenantName: ctx.tenant.name,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: ctx.user.id,
  });
  await withTenant(ctx.tenant.id, (tx) =>
    audit(tx, {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "user_invited",
      data: { email: parsed.data.email, role: parsed.data.role },
    })
  );
  revalidatePath("/app/configuracoes/equipe");
  return { ok: true, message: `Convite enviado. Link: ${inviteUrl}` };
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({
      membershipId: z.string().uuid(),
      role: z.enum(["owner", "manager", "seller"]).optional(),
      status: z.enum(["active", "disabled"]).optional(),
    })
    .parse({
      membershipId: formData.get("membershipId"),
      role: formData.get("role") || undefined,
      status: formData.get("status") || undefined,
    });

  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const target = (
        await tx.select().from(memberships).where(eq(memberships.id, parsed.membershipId)).limit(1)
      )[0];
      if (!target) return;
      // An owner cannot demote/disable themself (avoids lockout).
      if (target.userId === ctx.user.id) return;
      await tx
        .update(memberships)
        .set({ ...(parsed.role ? { role: parsed.role } : {}), ...(parsed.status ? { status: parsed.status } : {}) })
        .where(eq(memberships.id, parsed.membershipId));
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "member_update",
        entity: "membership",
        entityId: parsed.membershipId,
        data: { role: parsed.role, status: parsed.status },
      });
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/configuracoes/equipe");
}

// ------------------------------------------------------- quick replies -----

export async function saveQuickReplyAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("manager");
  const parsed = z
    .object({ shortcut: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/), body: z.string().min(1).max(2000) })
    .safeParse({ shortcut: formData.get("shortcut"), body: formData.get("body") });
  if (!parsed.success) return { error: "Atalho deve ter só letras minúsculas, números e hífens." };
  await withTenant(ctx.tenant.id, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(quickReplies)
        .where(and(eq(quickReplies.tenantId, ctx.tenant.id), eq(quickReplies.shortcut, parsed.data.shortcut)))
        .limit(1)
    )[0];
    if (existing) {
      await tx.update(quickReplies).set({ body: parsed.data.body }).where(eq(quickReplies.id, existing.id));
    } else {
      await tx.insert(quickReplies).values({ tenantId: ctx.tenant.id, ...parsed.data });
    }
  });
  revalidatePath("/app/configuracoes/respostas-rapidas");
  return { ok: true, message: "Resposta rápida salva." };
}

export async function deleteQuickReplyAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("manager");
  const id = z.string().uuid().parse(formData.get("id"));
  await withTenant(ctx.tenant.id, (tx) => tx.delete(quickReplies).where(eq(quickReplies.id, id)));
  revalidatePath("/app/configuracoes/respostas-rapidas");
}

// ------------------------------------------------------------- routing -----

export async function saveRoutingRuleAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("manager");
  const parsed = z
    .object({
      source: z.string().max(100).optional(),
      mode: z.enum(["round_robin", "fixed", "unassigned"]),
      fixedUserId: z.string().uuid().optional(),
    })
    .safeParse({
      source: formData.get("source") || undefined,
      mode: formData.get("mode"),
      fixedUserId: formData.get("fixedUserId") || undefined,
    });
  if (!parsed.success) return { error: "Regra inválida." };
  if (parsed.data.mode === "fixed" && !parsed.data.fixedUserId) {
    return { error: "Escolha o vendedor fixo." };
  }
  const source = parsed.data.source?.trim() || null;

  await withTenant(ctx.tenant.id, async (tx) => {
    const existing = (
      await tx.select().from(leadRoutingRules).where(eq(leadRoutingRules.tenantId, ctx.tenant.id))
    ).find((r) => r.source === source);
    const values = {
      mode: parsed.data.mode,
      fixedUserId: parsed.data.mode === "fixed" ? parsed.data.fixedUserId : null,
      active: true,
    };
    if (existing) {
      await tx.update(leadRoutingRules).set(values).where(eq(leadRoutingRules.id, existing.id));
    } else {
      await tx.insert(leadRoutingRules).values({ tenantId: ctx.tenant.id, source, ...values });
    }
    await audit(tx, {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "routing_rule_update",
      data: { source, ...values },
    });
  });
  revalidatePath("/app/configuracoes/distribuicao");
  return { ok: true, message: "Regra salva." };
}

export async function deleteRoutingRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("manager");
  const id = z.string().uuid().parse(formData.get("id"));
  await withTenant(ctx.tenant.id, (tx) => tx.delete(leadRoutingRules).where(eq(leadRoutingRules.id, id)));
  revalidatePath("/app/configuracoes/distribuicao");
}

// -------------------------------------------------------------- funnel -----

async function defaultPipelineStages(tx: Tx, tenantId: string) {
  const pipeline = (
    await tx
      .select()
      .from(pipelines)
      .where(and(eq(pipelines.tenantId, tenantId), eq(pipelines.isDefault, true)))
      .limit(1)
  )[0];
  if (!pipeline) return null;
  const rows = await tx.select().from(stages).where(eq(stages.pipelineId, pipeline.id));
  rows.sort((a, b) => a.position - b.position);
  return { pipeline, rows };
}

export async function renameStageAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({ stageId: z.string().uuid(), name: z.string().min(1).max(60) })
    .parse({ stageId: formData.get("stageId"), name: formData.get("name") });
  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      await tx
        .update(stages)
        .set({ name: parsed.name.trim() })
        .where(and(eq(stages.tenantId, ctx.tenant.id), eq(stages.id, parsed.stageId)));
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "stage_rename",
        entity: "stage",
        entityId: parsed.stageId,
        data: { name: parsed.name },
      });
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/configuracoes/funil");
}

export async function createStageAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("owner");
  const parsed = z.object({ name: z.string().min(1).max(60) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "Informe o nome da etapa." };
  const result = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const data = await defaultPipelineStages(tx, ctx.tenant.id);
      if (!data) return { error: "Nenhum funil padrão encontrado." };
      // New open stages enter right before Ganhou/Perdeu.
      const open = data.rows.filter((s) => s.kind === "open");
      if (open.length >= 10) return { error: "Limite de 10 etapas abertas atingido." };
      const position = open.length > 0 ? open[open.length - 1].position + 1 : 0;
      // Shift the won/lost stages one slot to the right.
      for (const s of data.rows.filter((s) => s.position >= position)) {
        await tx.update(stages).set({ position: s.position + 1 }).where(eq(stages.id, s.id));
      }
      const [created] = await tx
        .insert(stages)
        .values({
          tenantId: ctx.tenant.id,
          pipelineId: data.pipeline.id,
          name: parsed.data.name.trim(),
          kind: "open",
          position,
        })
        .returning();
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "stage_create",
        entity: "stage",
        entityId: created.id,
        data: { name: created.name },
      });
      return { ok: true as const };
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/configuracoes/funil");
  return "error" in result && result.error ? { error: result.error } : { ok: true, message: "Etapa criada." };
}

export async function deleteStageAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("owner");
  const stageId = z.string().uuid().parse(formData.get("stageId"));
  const result = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const stage = (
        await tx
          .select()
          .from(stages)
          .where(and(eq(stages.tenantId, ctx.tenant.id), eq(stages.id, stageId)))
          .limit(1)
      )[0];
      if (!stage) return { error: "Etapa não encontrada." };
      if (stage.kind !== "open") {
        return { error: "As etapas Ganhou/Perdeu não podem ser excluídas — elas alimentam os relatórios." };
      }
      const data = await defaultPipelineStages(tx, ctx.tenant.id);
      if (!data || data.rows.filter((s) => s.kind === "open").length <= 1) {
        return { error: "O funil precisa de pelo menos uma etapa aberta." };
      }
      const inUse = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.tenantId, ctx.tenant.id), eq(deals.stageId, stageId)))
        .limit(1);
      if (inUse.length > 0) {
        return { error: "Há negociações nesta etapa. Mova-as antes de excluir." };
      }
      await tx.delete(stages).where(eq(stages.id, stageId));
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "stage_delete",
        entity: "stage",
        entityId: stageId,
        data: { name: stage.name },
      });
      return { ok: true as const };
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/configuracoes/funil");
  return "error" in result && result.error ? { error: result.error } : { ok: true, message: "Etapa excluída." };
}

export async function moveStageAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({ stageId: z.string().uuid(), direction: z.enum(["up", "down"]) })
    .parse({ stageId: formData.get("stageId"), direction: formData.get("direction") });
  await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const data = await defaultPipelineStages(tx, ctx.tenant.id);
      if (!data) return;
      const open = data.rows.filter((s) => s.kind === "open");
      const idx = open.findIndex((s) => s.id === parsed.stageId);
      if (idx === -1) return; // won/lost stages are not reorderable
      const swapWith = parsed.direction === "up" ? open[idx - 1] : open[idx + 1];
      if (!swapWith) return;
      const current = open[idx];
      await tx.update(stages).set({ position: swapWith.position }).where(eq(stages.id, current.id));
      await tx.update(stages).set({ position: current.position }).where(eq(stages.id, swapWith.id));
    },
    { userId: ctx.user.id }
  );
  revalidatePath("/app/configuracoes/funil");
}

// ------------------------------------------------------------ whatsapp -----

export async function refreshWaStatusAction(): Promise<void> {
  const ctx = await requireRole("owner");
  await withTenant(ctx.tenant.id, async (tx) => {
    const account = (
      await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
    )[0];
    if (!account) return;
    try {
      const info = await fetchPhoneNumberInfo(account.phoneNumberId, accountToken(account));
      await tx
        .update(whatsappAccounts)
        .set({
          displayPhone: info.display_phone_number ?? account.displayPhone,
          verifiedName: info.verified_name ?? account.verifiedName,
          qualityRating: info.quality_rating ?? account.qualityRating,
          messagingLimit: info.messaging_limit_tier ?? account.messagingLimit,
          status: "connected",
        })
        .where(eq(whatsappAccounts.id, account.id));
    } catch {
      await tx.update(whatsappAccounts).set({ status: "error" }).where(eq(whatsappAccounts.id, account.id));
    }
  });
  revalidatePath("/app/configuracoes/whatsapp");
}

export async function createTemplateAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireRole("owner");
  const parsed = z
    .object({
      name: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
      category: z.enum(["MARKETING", "UTILITY"]),
      body: z.string().min(1).max(1024),
    })
    .safeParse({ name: formData.get("name"), category: formData.get("category"), body: formData.get("body") });
  if (!parsed.success) {
    return { error: "Nome do template deve usar letras minúsculas, números e _ (ex.: boas_vindas)." };
  }

  const result = await withTenant(ctx.tenant.id, async (tx) => {
    const account = (
      await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
    )[0];
    if (!account) return { error: "Conecte o WhatsApp primeiro." };
    let remoteStatus = "PENDING";
    let remoteId: string | null = null;
    try {
      const res = await createRemoteTemplate(account, {
        name: parsed.data.name,
        language: "pt_BR",
        category: parsed.data.category,
        bodyText: parsed.data.body,
      });
      remoteStatus = res.status ?? "PENDING";
      remoteId = res.id ?? null;
    } catch {
      return { error: "A Meta rejeitou a criação do template. Verifique o nome e o texto." };
    }
    await tx.insert(waTemplates).values({
      tenantId: ctx.tenant.id,
      name: parsed.data.name,
      language: "pt_BR",
      category: parsed.data.category,
      status: remoteStatus,
      body: parsed.data.body,
      waTemplateId: remoteId,
    });
    return { ok: true as const };
  });
  revalidatePath("/app/configuracoes/whatsapp");
  return "error" in result && result.error ? { error: result.error } : { ok: true, message: "Template enviado para aprovação." };
}

export async function syncTemplatesAction(): Promise<void> {
  const ctx = await requireRole("owner");
  await withTenant(ctx.tenant.id, async (tx) => {
    const account = (
      await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
    )[0];
    if (!account) return;
    try {
      const remote = await listRemoteTemplates(account);
      for (const t of remote.data ?? []) {
        const existing = (
          await tx
            .select()
            .from(waTemplates)
            .where(
              and(
                eq(waTemplates.tenantId, ctx.tenant.id),
                eq(waTemplates.name, t.name),
                eq(waTemplates.language, t.language)
              )
            )
            .limit(1)
        )[0];
        if (existing) {
          await tx.update(waTemplates).set({ status: t.status }).where(eq(waTemplates.id, existing.id));
        }
      }
    } catch {
      /* keep local statuses when Meta is unreachable */
    }
  });
  revalidatePath("/app/configuracoes/whatsapp");
}

// ------------------------------------------------------------ security -----

export async function changePasswordAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const ctx = await requireTenant();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(current, ctx.user.passwordHash))) return { error: "Senha atual incorreta." };
  const weak = validatePasswordStrength(password);
  if (weak) return { error: weak };
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, ctx.user.id));
  await destroyAllSessions(ctx.user.id);
  // Re-create the current session so the user stays logged in here.
  const token = await createSession(ctx.user.id, { activeTenantId: ctx.tenant.id });
  await setSessionCookie(token);
  await withTenant(ctx.tenant.id, (tx) =>
    audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "password_change" })
  );
  return { ok: true, message: "Senha alterada. As outras sessões foram encerradas." };
}

export async function beginTotpSetupAction(): Promise<{ secret: string; uri: string }> {
  const auth = await getSession();
  if (!auth) throw new Error("unauthorized");
  const secret = generateTotpSecret();
  return { secret, uri: totpUri(secret, auth.user.email, brand.productName) };
}

export async function confirmTotpAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const auth = await getSession();
  if (!auth) return { error: "Sessão expirada." };
  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!secret || !verifyTotp(secret, code)) return { error: "Código inválido. Confira o app autenticador." };
  await db.update(users).set({ totpSecretEnc: encryptSecret(secret) }).where(eq(users.id, auth.user.id));
  revalidatePath("/app/configuracoes/seguranca");
  return { ok: true, message: "2FA ativado com sucesso." };
}

export async function disableTotpAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const auth = await getSession();
  if (!auth) return { error: "Sessão expirada." };
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, auth.user.passwordHash))) return { error: "Senha incorreta." };
  if (auth.user.totpSecretEnc) decryptSecret(auth.user.totpSecretEnc); // sanity
  await db.update(users).set({ totpSecretEnc: null }).where(eq(users.id, auth.user.id));
  revalidatePath("/app/configuracoes/seguranca");
  return { ok: true, message: "2FA desativado." };
}
