import { Aviso } from '../components/Aviso';
import { SecaoCard } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { GraficoBarrasLinha } from '../components/charts';
import { fmtInt, fmtMoeda, fmtPct } from '../lib/format';
import { agrupar, cpc, cpl, ctr, porDia, somar, taxaConv, variacao } from '../lib/metrics';
import type { FiltroPlataforma, Registro } from '../types';

export function GoogleAds({
  atuais,
  anteriores,
  plataformaFiltro,
}: {
  atuais: Registro[];
  anteriores: Registro[];
  plataformaFiltro: FiltroPlataforma;
}) {
  if (plataformaFiltro === 'LinkedIn') {
    return (
      <Aviso texto="O filtro de plataforma está em LinkedIn. Selecione Todas ou Google para ver esta página." />
    );
  }

  const registros = atuais.filter((r) => r.plataforma === 'Google');
  const registrosAnt = anteriores.filter((r) => r.plataforma === 'Google');

  if (registros.length === 0) {
    return <Aviso texto="Sem dados do Google Ads no período selecionado." />;
  }

  const t = somar(registros);
  const p = somar(registrosAnt);

  const dias = porDia(registros).map((d) => ({ data: d.data, barra: d.cliques, linha: d.leads }));

  const temPalavraChave = registros.some((r) => r.palavraChave);
  const linhas = [
    ...agrupar(registros, (r) => `${r.campanha}|${r.palavraChave ?? ''}`).entries(),
  ]
    .map(([chave, grupo]) => {
      const total = somar(grupo);
      return {
        chave,
        campanha: grupo[0].campanha,
        palavraChave: grupo[0].palavraChave ?? '-',
        impressoes: total.impressoes,
        cliques: total.cliques,
        ctr: ctr(total),
        cpc: cpc(total),
        custo: total.custo,
        conversoes: total.leads,
        cpl: cpl(total),
      };
    })
    .sort((a, b) => b.custo - a.custo);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard rotulo="Investimento" valor={fmtMoeda(t.custo)} delta={variacao(t.custo, p.custo)} />
        <KpiCard rotulo="Impressões" valor={fmtInt(t.impressoes)} delta={variacao(t.impressoes, p.impressoes)} />
        <KpiCard rotulo="Cliques" valor={fmtInt(t.cliques)} delta={variacao(t.cliques, p.cliques)} />
        <KpiCard rotulo="CTR" valor={fmtPct(ctr(t))} delta={variacao(ctr(t), ctr(p))} />
        <KpiCard rotulo="CPC" valor={fmtMoeda(cpc(t))} delta={variacao(cpc(t), cpc(p))} quedaEhBoa />
        <KpiCard rotulo="Conversões" valor={fmtInt(t.leads)} delta={variacao(t.leads, p.leads)} />
        <KpiCard rotulo="CPL" valor={fmtMoeda(cpl(t))} delta={variacao(cpl(t), cpl(p))} quedaEhBoa />
        <KpiCard
          rotulo="Taxa de conversão"
          valor={fmtPct(taxaConv(t))}
          delta={variacao(taxaConv(t), taxaConv(p))}
        />
      </div>

      <SecaoCard titulo="Cliques e conversões por dia">
        <GraficoBarrasLinha
          dados={dias}
          nomeBarra="Cliques"
          nomeLinha="Conversões"
          fmtBarra={(v) => fmtInt(v)}
        />
      </SecaoCard>

      {/*
        Parcela de impressões (Search IS): o export padrão usado aqui não traz esse dado.
        Quando o CSV do Google Ads incluir a coluna search_impression_share (0 a 1),
        renderize uma rosca com a parcela conquistada vs perdida, por exemplo:

        <SecaoCard titulo="Parcela de impressões (Search IS)" tom="alt">
          <RoscaPorPlataforma ... />  ou um Pie simples com [conquistada, perdida]
        </SecaoCard>
      */}

      <SecaoCard titulo="Campanhas e palavras-chave" tom="alt">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-wam-border text-left text-xs uppercase tracking-wide text-wam-muted">
                <th className="py-2 pr-3 font-semibold">Campanha</th>
                {temPalavraChave && <th className="py-2 pr-3 font-semibold">Palavra-chave</th>}
                <th className="py-2 pr-3 text-right font-semibold">Impr.</th>
                <th className="py-2 pr-3 text-right font-semibold">Cliques</th>
                <th className="py-2 pr-3 text-right font-semibold">CTR</th>
                <th className="py-2 pr-3 text-right font-semibold">CPC</th>
                <th className="py-2 pr-3 text-right font-semibold">Custo</th>
                <th className="py-2 pr-3 text-right font-semibold">Conv.</th>
                <th className="py-2 text-right font-semibold">CPL</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave} className="border-b border-wam-border last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-wam-ink">{l.campanha}</td>
                  {temPalavraChave && <td className="py-2.5 pr-3 text-wam-muted">{l.palavraChave}</td>}
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.impressoes)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.cliques)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtPct(l.ctr)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtMoeda(l.cpc)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtMoeda(l.custo)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.conversoes)}</td>
                  <td className="tnum py-2.5 text-right text-wam-ink">{fmtMoeda(l.cpl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SecaoCard>
    </div>
  );
}
