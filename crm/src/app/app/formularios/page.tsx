import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { forms, formSubmissions } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { FormBuilder } from "./FormBuilder";
import { deleteFormAction, saveFormAction } from "./actions";

export const metadata = { title: "Formulários" };
export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const ctx = await requireRole("manager");
  const rows = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select({
          form: forms,
          submissions: sql<number>`(SELECT count(*)::int FROM form_submissions fs WHERE fs.form_id = ${forms.id})`,
        })
        .from(forms)
        .where(eq(forms.tenantId, ctx.tenant.id))
        .orderBy(desc(forms.createdAt)),
    { userId: ctx.user.id }
  );
  const appUrl = process.env.APP_URL ?? "";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-xl font-bold">Formulários de captação</h1>

      <div className="mb-8 space-y-4">
        {rows.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">
            Nenhum formulário ainda. Crie o primeiro abaixo e publique o link em suas landing pages.
          </div>
        )}
        {rows.map(({ form, submissions }) => (
          <div key={form.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{form.name}</h2>
                  <span className={`badge ${form.active ? "bg-ok/10 text-ok" : "bg-gray-100 text-gray-500"}`}>
                    {form.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-xs text-muted">{submissions} envio(s)</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/app/formularios/${form.id}`} className="btn-secondary text-xs">Editar</Link>
                <form action={deleteFormAction}>
                  <input type="hidden" name="formId" value={form.id} />
                  <button type="submit" className="btn-danger text-xs">Excluir</button>
                </form>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div>
                <span className="text-muted">Link público: </span>
                <code className="rounded bg-gray-100 px-1">{appUrl}/f/{form.slug}</code>
              </div>
              <div>
                <span className="text-muted">Embed (iframe): </span>
                <code className="break-all rounded bg-gray-100 px-1">
                  {`<iframe src="${appUrl}/f/${form.slug}/embed" style="width:100%;border:0;min-height:480px"></iframe>`}
                </code>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-semibold">Novo formulário</h2>
        <FormBuilder action={saveFormAction} />
      </div>
    </div>
  );
}
