import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { pipelines, stages } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { createStageAction, deleteStageAction, moveStageAction, renameStageAction } from "../actions";

export const metadata = { title: "Funil de vendas" };
export const dynamic = "force-dynamic";

export default async function FunnelSettingsPage() {
  const ctx = await requireRole("owner");
  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const pipeline = (
        await tx
          .select()
          .from(pipelines)
          .where(and(eq(pipelines.tenantId, ctx.tenant.id), eq(pipelines.isDefault, true)))
          .limit(1)
      )[0];
      if (!pipeline) return null;
      const rows = await tx.select().from(stages).where(eq(stages.pipelineId, pipeline.id));
      rows.sort((a, b) => a.position - b.position);
      return { pipeline, stages: rows };
    },
    { userId: ctx.user.id }
  );

  if (!data) {
    return <p className="text-sm text-muted">Nenhum funil padrão encontrado.</p>;
  }
  const openStages = data.stages.filter((s) => s.kind === "open");

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-1 font-semibold">Etapas do funil</h2>
        <p className="mb-4 text-sm text-muted">
          Renomeie, reordene, crie ou exclua etapas. Ganhou e Perdeu são fixas no fim — elas alimentam os
          relatórios de conversão.
        </p>
        <div className="space-y-2">
          {data.stages.map((s, i) => {
            const openIdx = openStages.findIndex((o) => o.id === s.id);
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-line p-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    s.kind === "won" ? "bg-ok" : s.kind === "lost" ? "bg-danger" : "bg-accent"
                  }`}
                />
                <form action={renameStageAction} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="stageId" value={s.id} />
                  <input name="name" defaultValue={s.name} maxLength={60} className="input py-1.5 text-sm" />
                  <button type="submit" className="text-xs text-accent hover:underline">Salvar</button>
                </form>
                {s.kind === "open" ? (
                  <div className="flex items-center gap-1">
                    <form action={moveStageAction}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={openIdx <= 0}
                        className="rounded border border-line px-1.5 py-0.5 text-xs disabled:opacity-30"
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveStageAction}>
                      <input type="hidden" name="stageId" value={s.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={openIdx === openStages.length - 1}
                        className="rounded border border-line px-1.5 py-0.5 text-xs disabled:opacity-30"
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                    </form>
                    <ActionForm
                      action={deleteStageAction}
                      submitLabel="Excluir"
                      className="inline"
                      submitClassName="px-1.5 text-xs text-danger hover:underline"
                    >
                      <input type="hidden" name="stageId" value={s.id} />
                    </ActionForm>
                  </div>
                ) : (
                  <span className="badge bg-gray-100 text-gray-500">
                    {s.kind === "won" ? "Ganhou (fixa)" : "Perdeu (fixa)"}
                  </span>
                )}
                <span className="w-6 text-right text-xs text-muted">{i + 1}º</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card max-w-xl p-5">
        <h2 className="mb-3 font-semibold">Nova etapa</h2>
        <ActionForm action={createStageAction} submitLabel="Criar etapa" className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="sname">Nome da etapa</label>
            <input id="sname" name="name" required maxLength={60} className="input" placeholder="Ex.: Negociação" />
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">A nova etapa entra logo antes de Ganhou/Perdeu.</p>
      </div>
    </div>
  );
}
