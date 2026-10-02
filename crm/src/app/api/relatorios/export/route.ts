import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { apiTenantCtx } from "@/lib/auth/guard";
import { isManager } from "@/lib/inbox";
import {
  firstResponseReport,
  funnelReport,
  leadsBySourceReport,
  parsePeriod,
  productivityReport,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
}

/** CSV export of the 4 v1 reports. Every export is written to the audit log. */
export async function GET(req: NextRequest) {
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const type = params.get("type") ?? "origens";
  const period = parsePeriod(params.get("from") ?? undefined, params.get("to") ?? undefined);
  const onlyUserId = isManager(ctx) ? undefined : ctx.user.id;

  const csv = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      let rows: Array<Record<string, unknown>>;
      switch (type) {
        case "primeira-resposta":
          rows = (await firstResponseReport(tx, ctx.tenant.id, period, onlyUserId)).map((r) => ({
            vendedor: r.user_name ?? "Não atribuído",
            conversas: r.conversations,
            mediana_minutos: r.median_minutes,
            media_minutos: r.avg_minutes,
          }));
          break;
        case "funil": {
          const funnel = await funnelReport(tx, ctx.tenant.id, period, onlyUserId);
          rows = funnel.stages.map((s) => ({ etapa: s.stage_name, tipo: s.kind, negociacoes: s.deals }));
          break;
        }
        case "produtividade":
          rows = (await productivityReport(tx, ctx.tenant.id, period, onlyUserId)).map((r) => ({
            vendedor: r.user_name,
            conversas_atendidas: r.conversations_handled,
            mensagens_enviadas: r.messages_sent,
            ganhos: r.deals_won,
            valor_ganho: r.value_won,
          }));
          break;
        default:
          rows = (await leadsBySourceReport(tx, ctx.tenant.id, period, onlyUserId)).map((r) => ({
            origem: r.source,
            leads: r.leads,
            ganhos: r.won,
            valor_ganho: r.total_value,
          }));
      }
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "export_csv",
        data: { type, from: period.from.toISOString(), to: period.to.toISOString() },
      });
      return toCsv(rows);
    },
    { userId: ctx.user.id }
  );

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${type}.csv"`,
    },
  });
}
