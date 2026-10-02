"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { platformSettings, tenants } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/guard";
import { createInvitation } from "@/lib/invites";
import { provisionTenant, slugify } from "@/lib/tenancy";

export type AdminActionState = { error?: string; ok?: boolean; inviteUrl?: string; message?: string };

export async function createTenantAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  const parsed = z
    .object({ name: z.string().min(2).max(120), ownerEmail: z.string().email().max(200) })
    .safeParse({ name: formData.get("name"), ownerEmail: formData.get("ownerEmail") });
  if (!parsed.success) return { error: "Preencha o nome da empresa e o e-mail do dono." };

  let slug = slugify(parsed.data.name);
  if (!slug) return { error: "Nome inválido." };
  const clash = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (clash[0]) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const tenantId = await provisionTenant(parsed.data.name, slug);
  const inviteUrl = await createInvitation({
    tenantId,
    tenantName: parsed.data.name,
    email: parsed.data.ownerEmail,
    role: "owner",
    invitedBy: admin.user.id,
  });
  revalidatePath("/admin");
  return { ok: true, inviteUrl };
}

export async function setTenantStatusAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));
  const status = z.enum(["active", "suspended"]).parse(formData.get("status"));
  await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
  revalidatePath("/admin");
}

/** Platform setting: unit price (BRL) per Meta service message beyond the free tier. */
export async function setServiceMsgPriceAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requirePlatformAdmin();
  const parsed = z.coerce.number().min(0).max(10).safeParse(formData.get("price"));
  if (!parsed.success) return { error: "Informe um valor entre 0 e 10 (ex.: 0.035)." };
  await db
    .insert(platformSettings)
    .values({ key: "META_SERVICE_MSG_BRL", value: String(parsed.data) })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: String(parsed.data), updatedAt: new Date() },
    });
  revalidatePath("/admin");
  return { ok: true, message: "Preço unitário atualizado." };
}
