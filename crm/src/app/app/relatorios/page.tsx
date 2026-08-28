import { withTenant } from "@/db";
import { requireTenant } from "@/lib/auth/guard";
import { isManager } from "@/lib/inbox";
import {
  firstResponseReport,
  funnelReport,
  leadsBySourceReport,
  parsePeriod,
  productivityReport,
} from "@/lib/reports";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

function money(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function minutes(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v < 60) return `${v} min`;
  return `${(v / 60).toFixed(1)} h`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await requireTenant();
  const { from, to } = await searchParams;
  const period = parsePeriod(from, to);
  const manager = isManager(ctx);
  const onlyUserId = manager ? undefined : ctx.user.id;

  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => ({
      firstResponse: await firstResponseReport(tx, ctx.tenant.id, period, onlyUserId),
      sources: await leadsBySourceReport(tx, ctx.tenant.id, period, onlyUserId),
      funnel: await funnelReport(tx, ctx.tenant.id, period, onlyUserId),
      productivity: await productivityReport(tx, ctx.tenant.id, period, onlyUserId),
    }),
    { userId: ctx.user.id }
  );

  const maxSource = Math.max(1, ...data.sources.map((s) => s.leads));
  const openStages = data.funnel.stages.filter((s) => s.kind === "open");
  const maxStage = Math.max(1, ...openStages.map((s) => s.deals));
  const csvBase = `/api/relatorios/export?from=${isoDay(period.from)}&to=${isoDay(period.to)}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Relatórios</h1>
          {!manager && <p className="text-sm text-muted">Você vê apenas os seus próprios números.</p>}
        </div>
        <form className="flex items-end gap-2" action="/app/relatorios" method="GET">
          <div>
            <label className="label text-xs">De</label>
            <input type="date" name="from" defaultValue={isoDay(period.from)} className="input py-1.5 text-sm" />
          </div>
          <div>
            <label className="label text-xs">Até</label>
            <input type="date" name="to" defaultValue={isoDay(period.to)} className="input py-1.5 text-sm" />
          </div>
          <button type="submit" className="btn-secondary py-1.5 text-sm">Aplicar</button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs uppercase text-muted">Ganhos no período</div>
          <div className="mt-1 text-2xl font-bold text-ok">{data.funnel.summary?.won ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase text-muted">Perdidos</div>
          <div className="mt-1 text-2xl font-bold text-danger">{data.funnel.summary?.lost ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase text-muted">Valor total ganho</div>
          <div className="mt-1 text-2xl font-bold">{money(data.funnel.summary?.total_won_value)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase text-muted">Ticket médio</div>
          <div className="mt-1 text-2xl font-bold">{money(data.funnel.summary?.avg_ticket)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1 — First response time */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Tempo de primeira resposta</h2>
            <a href={`${csvBase}&type=primeira-resposta`} className="text-xs text-accent hover:underline">Exportar CSV</a>
          </div>
          {data.firstResponse.length === 0 ? (
            <p className="text-sm text-muted">Sem conversas respondidas no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1">Vendedor</th>
                  <th className="py-1 text-right">Conversas</th>
                  <th className="py-1 text-right">Mediana</th>
                  <th className="py-1 text-right">Média</th>
                </tr>
              </thead>
              <tbody>
                {data.firstResponse.map((r) => (
                  <tr key={r.user_id ?? "none"} className="border-t border-line">
                    <td className="py-2">{r.user_name ?? "Não atribuído"}</td>
                    <td className="py-2 text-right">{r.conversations}</td>
                    <td className="py-2 text-right font-medium">{minutes(r.median_minutes)}</td>
                    <td className="py-2 text-right text-muted">{minutes(r.avg_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 2 — Leads by source */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Leads por canal / origem</h2>
            <a href={`${csvBase}&type=origens`} className="text-xs text-accent hover:underline">Exportar CSV</a>
          </div>
          {data.sources.length === 0 ? (
            <p className="text-sm text-muted">Nenhum lead no período.</p>
          ) : (
            <div className="space-y-2">
              {data.sources.map((s) => (
                <div key={s.source ?? "none"} className="text-sm">
                  <div className="mb-0.5 flex justify-between">
                    <span>{s.source}</span>
                    <span className="text-muted">{s.leads} lead(s) · {s.won} ganho(s)</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(s.leads / maxSource) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3 — Funnel */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Funil por etapa</h2>
            <a href={`${csvBase}&type=funil`} className="text-xs text-accent hover:underline">Exportar CSV</a>
          </div>
          <div className="space-y-2">
            {openStages.map((s) => (
              <div key={s.stage_id} className="text-sm">
                <div className="mb-0.5 flex justify-between">
                  <span>{s.stage_name}</span>
                  <span className="text-muted">{s.deals}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-accent/70" style={{ width: `${(s.deals / maxStage) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {data.funnel.lostReasons.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted">Motivos de perda</h3>
              <ul className="space-y-1 text-sm">
                {data.funnel.lostReasons.map((r) => (
                  <li key={r.reason} className="flex justify-between">
                    <span>{r.reason}</span>
                    <span className="text-muted">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 4 — Productivity */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Produtividade por vendedor</h2>
            <a href={`${csvBase}&type=produtividade`} className="text-xs text-accent hover:underline">Exportar CSV</a>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1">Vendedor</th>
                <th className="py-1 text-right">Atendidas</th>
                <th className="py-1 text-right">Msgs</th>
                <th className="py-1 text-right">Ganhos</th>
                <th className="py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.productivity.map((r) => (
                <tr key={r.user_id} className="border-t border-line">
                  <td className="py-2">{r.user_name}</td>
                  <td className="py-2 text-right">{r.conversations_handled}</td>
                  <td className="py-2 text-right">{r.messages_sent}</td>
                  <td className="py-2 text-right">{r.deals_won}</td>
                  <td className="py-2 text-right font-medium">{money(r.value_won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
