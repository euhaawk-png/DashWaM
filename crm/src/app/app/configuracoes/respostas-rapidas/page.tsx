import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { quickReplies } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { deleteQuickReplyAction, saveQuickReplyAction } from "../actions";

export const metadata = { title: "Respostas rápidas" };
export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  const ctx = await requireRole("manager");
  const replies = await withTenant(
    ctx.tenant.id,
    (tx) => tx.select().from(quickReplies).where(eq(quickReplies.tenantId, ctx.tenant.id)),
    { userId: ctx.user.id }
  );

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-1 font-semibold">Nova resposta rápida</h2>
        <p className="mb-4 text-sm text-muted">
          Atalhos de mensagens usados pelo time no inbox (botão ⚡ do composer).
        </p>
        <ActionForm action={saveQuickReplyAction} submitLabel="Salvar">
          <div>
            <label className="label" htmlFor="shortcut">Atalho (ex.: saudacao)</label>
            <input id="shortcut" name="shortcut" required pattern="[a-z0-9-]+" className="input w-56" />
          </div>
          <div>
            <label className="label" htmlFor="body">Mensagem</label>
            <textarea id="body" name="body" rows={3} required className="input" />
          </div>
        </ActionForm>
      </div>

      <div className="card max-w-xl divide-y divide-line">
        {replies.length === 0 && (
          <p className="p-5 text-sm text-muted">Nenhuma resposta rápida ainda. Crie a primeira acima.</p>
        )}
        {replies.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">/{r.shortcut}</div>
              <div className="whitespace-pre-wrap text-sm text-muted">{r.body}</div>
            </div>
            <form action={deleteQuickReplyAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-xs text-danger hover:underline">Excluir</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
