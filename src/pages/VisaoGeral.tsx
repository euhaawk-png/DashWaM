import { Aviso } from '../components/Aviso';
import { SecaoCard } from '../components/Card';
import { ChannelTag } from '../components/ChannelTag';
import { KpiCard } from '../components/KpiCard';
import {
  BarrasHorizontaisPorPlataforma,
  GraficoBarrasLinha,
  RoscaPorPlataforma,
} from '../components/charts';
import { fmtInt, fmtMoeda, fmtPct } from '../lib/format';
import { agrupar, cpl, ctr, porDia, somar, variacao } from '../lib/metrics';
import type { Plataforma, Registro } from '../types';

export function VisaoGeral({ atuais, anteriores }: { atuais: Registro[]; anteriores: Registro[] }) {
  if (atuais.length === 0) {
    return <Aviso texto="Sem dados no período selecionado. Ajuste o período ou o filtro de plataforma." />;
  }

  const t = somar(atuais);
  const p = somar(anteriores);

  const dias = porDia(atuais).map((d) => ({ data: d.data, barra: d.custo, linha: d.leads }));

  const plataformas: Plataforma[] = ['Google', 'LinkedIn'];
  const investimentoPorPlataforma = plataformas
    .map((nome) => ({
      nome,
      valor: somar(atuais.filter((r) => r.plataforma === nome)).custo,
    }))
    .filter((d) => d.valor > 0);
  const leadsPorPlataforma = plataformas
    .map((nome) => ({
      nome,
      valor: somar(atuais.filter((r) => r.plataforma === nome)).leads,
    }))
    .filter((d) => d.valor > 0);

  const campanhas = [...agrupar(atuais, (r) => `${r.plataforma}|${r.campanha}`).entries()]
    .map(([chave, registros]) => {
      const total = somar(registros);
      return {
        chave,
        plataforma: registros[0].plataforma,
        campanha: registros[0].campanha,
        custo: total.custo,
        leads: total.leads,
        cpl: cpl(total),
      };
    })
    .sort((a, b) => b.custo - a.custo);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard rotulo="Investimento total" valor={fmtMoeda(t.custo)} delta={variacao(t.custo, p.custo)} />
        <KpiCard rotulo="Leads" valor={fmtInt(t.leads)} delta={variacao(t.leads, p.leads)} />
        <KpiCard rotulo="CPL" valor={fmtMoeda(cpl(t))} delta={variacao(cpl(t), cpl(p))} quedaEhBoa />
        <KpiCard rotulo="Impressões" valor={fmtInt(t.impressoes)} delta={variacao(t.impressoes, p.impressoes)} />
        <KpiCard rotulo="Cliques" valor={fmtInt(t.cliques)} delta={variacao(t.cliques, p.cliques)} />
        <KpiCard rotulo="CTR" valor={fmtPct(ctr(t))} delta={variacao(ctr(t), ctr(p))} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SecaoCard titulo="Investimento e leads por dia" className="xl:col-span-2">
          <GraficoBarrasLinha
            dados={dias}
            nomeBarra="Investimento"
            nomeLinha="Leads"
            fmtBarra={(v) => fmtMoeda(v)}
            moedaNoEixo
          />
        </SecaoCard>
        <SecaoCard titulo="Investimento por plataforma" tom="alt">
          <RoscaPorPlataforma
            dados={investimentoPorPlataforma}
            fmtValor={(v) => fmtMoeda(v)}
            totalRotulo="Total"
          />
        </SecaoCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SecaoCard titulo="Leads por plataforma" tom="alt">
          <BarrasHorizontaisPorPlataforma dados={leadsPorPlataforma} />
          <p className="mt-2 text-xs text-wam-muted">
            Google: conversões da conta · LinkedIn: Lead Gen Forms. Origens separadas, sem soma em
            duplicidade.
          </p>
        </SecaoCard>
        <SecaoCard titulo="Resumo por campanha" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-wam-border text-left text-xs uppercase tracking-wide text-wam-muted">
                  <th className="py-2 pr-3 font-semibold">Campanha</th>
                  <th className="py-2 pr-3 font-semibold">Canal</th>
                  <th className="py-2 pr-3 text-right font-semibold">Investimento</th>
                  <th className="py-2 pr-3 text-right font-semibold">Leads</th>
                  <th className="py-2 text-right font-semibold">CPL</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.chave} className="border-b border-wam-border last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-wam-ink">{c.campanha}</td>
                    <td className="py-2.5 pr-3">
                      <ChannelTag plataforma={c.plataforma} />
                    </td>
                    <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtMoeda(c.custo)}</td>
                    <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(c.leads)}</td>
                    <td className="tnum py-2.5 text-right text-wam-ink">
                      {c.cpl != null ? fmtMoeda(c.cpl) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SecaoCard>
      </div>
    </div>
  );
}
