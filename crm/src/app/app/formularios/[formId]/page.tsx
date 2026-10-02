import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { forms } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { FormBuilder } from "../FormBuilder";
import { saveFormAction } from "../actions";

export const metadata = { title: "Editar formulário" };
export const dynamic = "force-dynamic";

export default async function EditFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const ctx = await requireRole("manager");
  const { formId } = await params;
  const form = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select()
        .from(forms)
        .where(and(eq(forms.tenantId, ctx.tenant.id), eq(forms.id, formId)))
        .limit(1)
        .then((r) => r[0]),
    { userId: ctx.user.id }
  );
  if (!form) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/app/formularios" className="text-sm text-muted hover:text-ink">← Formulários</Link>
      <h1 className="mb-6 mt-1 text-xl font-extrabold">Editar: {form.name}</h1>
      <div className="card p-5">
        <FormBuilder
          action={saveFormAction}
          initial={{
            formId: form.id,
            name: form.name,
            fields: form.fields,
            buttonLabel: form.buttonLabel,
            successMessage: form.successMessage,
            showWhatsappCta: form.showWhatsappCta,
            consentText: form.consentText,
            distribute: form.distribute,
            active: form.active,
          }}
        />
      </div>
    </div>
  );
}
