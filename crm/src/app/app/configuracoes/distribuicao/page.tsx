import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { leadRoutingRules, users } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { listTeam } from "@/lib/inbox";
import { ActionForm } from "@/components/ActionForm";
import { deleteRoutingRuleAction, saveRoutingRuleAction } from "../actions";

export const metadata = { title: "Distribuição de leads" };
export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  round_robin: "Roleta entre vendedores",
  fixed: "Vendedor fixo",
  unassigned: "Fila de não atribuídos",
};

export default async function RoutingPage() {
  const ctx = await requireRole("manager");
  const { rules, team } = await withTenant(
    ctx.tenant.id,
    async (tx) => ({
      rules: await tx
        .select({
          id: leadRoutingRules.id,
          source: leadRoutingRules.source,
          mode: leadRoutingRules.mode,
          fixedUserName: users.name,
        })
        .from(leadRoutingRules)
        .leftJoin(users, eq(users.id, leadRoutingRules.fixedUserId))
        .where(eq(leadRoutingRules.tenantId, ctx.tenant.id)),
      team: await listTeam(tx, ctx.tenant.id),
    }),
    { userId: ctx.user.id }
  );
  const sellers = team.filter((m) => m.role === "seller");

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-1 font-semibold">Nova regra de distribuição</h2>
        <p className="mb-4 text-sm text-muted">
          Define quem recebe cada lead novo. Deixe a origem em branco para a regra padrão (todas as origens).
        </p>
        <ActionForm action={saveRoutingRuleAction} submitLabel="Salvar regra">
          <div>
            <label className="label" htmlFor="source">Origem (opcional)</label>
            <input id="source" name="source" placeholder="ex.: whatsapp, google_ads, form:contato" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="mode">Modo</label>
              <select id="mode" name="mode" className="input" defaultValue="round_robin">
                <option value="round_robin">Roleta (round-robin)</option>
                <option value="fixed">Vendedor fixo</option>
                <option value="unassigned">Fila de não atribuídos</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="fixedUserId">Vendedor fixo</label>
              <select id="fixedUserId" name="fixedUserId" className="input" defaultValue="">
                <option value="">—</option>
                {sellers.map((s) => (
                  <option key={s.userId} value={s.userId}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card max-w-xl divide-y divide-line">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <div className="font-medium">{r.source ?? "Padrão (todas as origens)"}</div>
              <div className="text-xs text-muted">
                {MODE_LABEL[r.mode]}
                {r.mode === "fixed" && r.fixedUserName ? ` — ${r.fixedUserName}` : ""}
              </div>
            </div>
            <form action={deleteRoutingRuleAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-xs text-danger hover:underline">Excluir</button>
            </form>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="p-5 text-sm text-muted">Sem regras: leads novos ficam na fila de não atribuídos.</p>
        )}
      </div>
    </div>
  );
}
