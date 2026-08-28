"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import { forms, publicEndpoints, type FormField } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guard";
import { slugify } from "@/lib/tenancy";
import { randomToken } from "@/lib/crypto";

export type FormActionState = { error?: string; ok?: boolean; message?: string };

const fieldSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "email", "phone", "textarea"]),
  required: z.boolean(),
});

const formSchema = z.object({
  name: z.string().min(2).max(120),
  fields: z.array(fieldSchema).min(1).max(20),
  buttonLabel: z.string().min(1).max(40),
  successMessage: z.string().min(1).max(500),
  showWhatsappCta: z.boolean(),
  consentText: z.string().max(500).optional(),
  distribute: z.boolean(),
  active: z.boolean(),
});

function parseFormData(formData: FormData) {
  let fields: unknown;
  try {
    fields = JSON.parse(String(formData.get("fieldsJson") ?? "[]"));
  } catch {
    fields = [];
  }
  return formSchema.safeParse({
    name: formData.get("name"),
    fields,
    buttonLabel: formData.get("buttonLabel") || "Enviar",
    successMessage: formData.get("successMessage") || "Recebemos seus dados. Em breve entraremos em contato!",
    showWhatsappCta: formData.get("showWhatsappCta") === "on",
    consentText: String(formData.get("consentText") ?? "") || undefined,
    distribute: formData.get("distribute") === "on",
    active: formData.get("active") !== "off",
  });
}

export async function saveFormAction(_prev: FormActionState, formData: FormData): Promise<FormActionState> {
  const ctx = await requireRole("manager");
  const parsed = parseFormData(formData);
  if (!parsed.success) return { error: "Verifique os campos do formulário (mínimo 1 campo)." };
  const formId = formData.get("formId") ? z.string().uuid().parse(formData.get("formId")) : null;

  if (formId) {
    await withTenant(
      ctx.tenant.id,
      async (tx) => {
        await tx
          .update(forms)
          .set({ ...parsed.data, fields: parsed.data.fields as FormField[], consentText: parsed.data.consentText ?? null })
          .where(and(eq(forms.tenantId, ctx.tenant.id), eq(forms.id, formId)));
        await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "form_update", entity: "form", entityId: formId });
      },
      { userId: ctx.user.id }
    );
    revalidatePath("/app/formularios");
    return { ok: true, message: "Formulário salvo." };
  }

  // New form: globally unique slug + public endpoint index.
  let slug = slugify(parsed.data.name) || "form";
  const clash = await db.select().from(forms).where(eq(forms.slug, slug)).limit(1);
  if (clash[0]) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "x1"}`;

  const created = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const [form] = await tx
        .insert(forms)
        .values({
          tenantId: ctx.tenant.id,
          slug,
          ...parsed.data,
          fields: parsed.data.fields as FormField[],
          consentText: parsed.data.consentText ?? null,
        })
        .returning();
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "form_create", entity: "form", entityId: form.id });
      return form;
    },
    { userId: ctx.user.id }
  );
  await db
    .insert(publicEndpoints)
    .values({ kind: "form_slug", key: created.slug, tenantId: ctx.tenant.id })
    .onConflictDoNothing();

  revalidatePath("/app/formularios");
  return { ok: true, message: "Formulário criado." };
}

export async function deleteFormAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("manager");
  const formId = z.string().uuid().parse(formData.get("formId"));
  const slug = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const form = (
        await tx.select().from(forms).where(and(eq(forms.tenantId, ctx.tenant.id), eq(forms.id, formId))).limit(1)
      )[0];
      if (!form) return null;
      await tx.delete(forms).where(eq(forms.id, formId));
      return form.slug;
    },
    { userId: ctx.user.id }
  );
  if (slug) {
    await db
      .delete(publicEndpoints)
      .where(and(eq(publicEndpoints.kind, "form_slug"), eq(publicEndpoints.key, slug)));
  }
  revalidatePath("/app/formularios");
}
