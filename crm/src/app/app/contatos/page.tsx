import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { contacts } from "@/db/schema";
import { requireTenant } from "@/lib/auth/guard";
import { formatPhone } from "@/lib/phone";
import { ActionForm } from "@/components/ActionForm";
import { createManualLeadAction, deleteContactAction } from "../pipeline/actions";

export const metadata = { title: "Contatos" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  const ctx = await requireTenant();
  const { q = "", p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const isOwner = ctx.role === "owner";

  const { rows, total } = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const base = and(
        eq(contacts.tenantId, ctx.tenant.id),
        isNull(contacts.deletedAt),
        q
          ? or(
              ilike(contacts.name, `%${q}%`),
              ilike(contacts.phone, `%${q.replace(/\D/g, "") || q}%`),
              ilike(contacts.email, `%${q}%`)
            )
          : undefined
      );
      const rows = await tx
        .select()
        .from(contacts)
        .where(base)
        .orderBy(desc(contacts.createdAt))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(base);
      return { rows, total: count };
    },
    { userId: ctx.user.id }
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Contatos</h1>
        <form className="flex gap-2" action="/app/contatos" method="GET">
          <input name="q" defaultValue={q} placeholder="Buscar nome, telefone ou e-mail…" className="input w-72 py-1.5 text-sm" />
          <button type="submit" className="btn-secondary py-1.5 text-sm">Buscar</button>
        </form>
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Novo lead manual</h2>
        <ActionForm action={createManualLeadAction} submitLabel="Criar lead" className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label className="label text-xs">Nome</label>
            <input name="name" required className="input py-1.5 text-sm" />
          </div>
          <div className="w-44">
            <label className="label text-xs">Telefone</label>
            <input name="phone" placeholder="(11) 99999-8888" className="input py-1.5 text-sm" />
          </div>
          <div className="w-52">
            <label className="label text-xs">E-mail</label>
            <input name="email" type="email" className="input py-1.5 text-sm" />
          </div>
          <div className="w-32">
            <label className="label text-xs">Valor (R$)</label>
            <input name="value" type="number" min={0} step="0.01" className="input py-1.5 text-sm" />
          </div>
        </ActionForm>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-gray-50 text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Criado</th>
              {isOwner && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{c.name ?? "—"}</td>
                <td className="px-4 py-3">{formatPhone(c.phone)}</td>
                <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.source && <span className="badge bg-gray-100 text-gray-600">{c.source}</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{c.createdAt.toLocaleDateString("pt-BR")}</td>
                {isOwner && (
                  <td className="px-4 py-3 text-right text-xs">
                    <a href={`/api/contatos/${c.id}/export`} className="mr-3 text-accent hover:underline">
                      Exportar (LGPD)
                    </a>
                    <form action={deleteContactAction} className="inline">
                      <input type="hidden" name="contactId" value={c.id} />
                      <button type="submit" className="text-danger hover:underline">Excluir</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  {q ? "Nenhum contato encontrado para esta busca." : "Nenhum contato ainda. Eles são criados automaticamente quando um cliente chama no WhatsApp ou preenche um formulário."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <a className="btn-secondary py-1 text-xs" href={`/app/contatos?q=${encodeURIComponent(q)}&p=${page - 1}`}>← Anterior</a>
          )}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && (
            <a className="btn-secondary py-1 text-xs" href={`/app/contatos?q=${encodeURIComponent(q)}&p=${page + 1}`}>Próxima →</a>
          )}
        </div>
      )}
    </div>
  );
}
