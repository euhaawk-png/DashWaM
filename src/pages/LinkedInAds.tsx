import { Aviso } from '../components/Aviso';
import { SecaoCard } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { BarrasSimples, GraficoBarrasLinha } from '../components/charts';
import { fmtInt, fmtMoeda, fmtPct } from '../lib/format';
import { agrupar, cpl, ctr, porDia, somar, taxaAbertura, variacao } from '../lib/metrics';
import type { FiltroPlataforma, Formato, Registro } from '../types';

const ORDEM_FORMATOS: Formato[] = ['Conversation', 'Carrossel', 'Imagem'];
const NOME_FORMATO: Record<string, string> = {
  Conversation: 'Conversation',
  Carrossel: 'Carrossel',
  Imagem: 'Imagem única',
};

export function LinkedInAds({
  atuais,
  anteriores,
  plataformaFiltro,
}: {
  atuais: Registro[];
  anteriores: Registro[];
  plataformaFiltro: FiltroPlataforma;
}) {
  if (plataformaFiltro === 'Google') {
    return (
      <Aviso texto="O filtro de plataforma está em Google. Selecione Todas ou LinkedIn para ver esta página." />
    );
  }

  const registros = atuais.filter((r) => r.plataforma === 'LinkedIn');
  const registrosAnt = anteriores.filter((r) => r.plataforma === 'LinkedIn');

  if (registros.length === 0) {
    return <Aviso texto="Sem dados do LinkedIn Ads no período selecionado." />;
  }

  const t = somar(registros);
  const p = somar(registrosAnt);

  const conv = somar(registros.filter((r) => r.formato === 'Conversation'));
  const convAnt = somar(registrosAnt.filter((r) => r.formato === 'Conversation'));
  const spon = somar(registros.filter((r) => r.formato === 'Carrossel' || r.formato === 'Imagem'));
  const sponAnt = somar(
    registrosAnt.filter((r) => r.formato === 'Carrossel' || r.formato === 'Imagem'),
  );

  const leadsPorFormato = ORDEM_FORMATOS.map((f) => ({
    nome: NOME_FORMATO[f],
    valor: somar(registros.filter((r) => r.formato === f)).leads,
  }));

  const dias = porDia(registros).map((d) => ({ data: d.data, barra: d.custo, linha: d.leads }));

  const linhas = [...agrupar(registros, (r) => r.campanha).entries()]
    .map(([campanha, grupo]) => {
      const total = somar(grupo);
      const formato = grupo[0].formato;
      const ehConversation = formato === 'Conversation';
      return {
        campanha,
        formato,
        volume: ehConversation ? total.envios : total.impressoes,
        cliques: total.cliques,
        taxa: ehConversation ? taxaAbertura(total) : ctr(total),
        ehConversation,
        custo: total.custo,
        leads: total.leads,
        cpl: cpl(total),
      };
    })
    .sort((a, b) => b.custo - a.custo);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard rotulo="Investimento" valor={fmtMoeda(t.custo)} delta={variacao(t.custo, p.custo)} />
        <KpiCard rotulo="Leads" valor={fmtInt(t.leads)} delta={variacao(t.leads, p.leads)} />
        <KpiCard rotulo="CPL" valor={fmtMoeda(cpl(t))} delta={variacao(cpl(t), cpl(p))} quedaEhBoa />
        <KpiCard rotulo="Impressões" valor={fmtInt(t.impressoes)} delta={variacao(t.impressoes, p.impressoes)} />
        <KpiCard rotulo="Cliques" valor={fmtInt(t.cliques)} delta={variacao(t.cliques, p.cliques)} />
        <KpiCard rotulo="CTR" valor={fmtPct(ctr(t))} delta={variacao(ctr(t), ctr(p))} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SecaoCard titulo="Leads por formato" tom="alt">
          <BarrasSimples dados={leadsPorFormato} nomeSerie="Leads" />
        </SecaoCard>
        <SecaoCard titulo="Investimento e leads por dia">
          <GraficoBarrasLinha
            dados={dias}
            nomeBarra="Investimento"
            nomeLinha="Leads"
            fmtBarra={(v) => fmtMoeda(v)}
            moedaNoEixo
          />
        </SecaoCard>
      </div>

      <SecaoCard titulo="Conversation / Message Ads" tom="alt">
        <p className="mb-3 text-xs text-wam-muted">
          Leads gerados via Lead Gen Forms nas conversas patrocinadas.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          <KpiCard compacto rotulo="Investimento" valor={fmtMoeda(conv.custo)} delta={variacao(conv.custo, convAnt.custo)} />
          <KpiCard compacto rotulo="Envios" valor={fmtInt(conv.envios)} delta={variacao(conv.envios, convAnt.envios)} />
          <KpiCard compacto rotulo="Aberturas" valor={fmtInt(conv.aberturas)} delta={variacao(conv.aberturas, convAnt.aberturas)} />
          <KpiCard
            compacto
            rotulo="Taxa de abertura"
            valor={fmtPct(taxaAbertura(conv))}
            delta={variacao(taxaAbertura(conv), taxaAbertura(convAnt))}
          />
          <KpiCard compacto rotulo="Cliques" valor={fmtInt(conv.cliques)} delta={variacao(conv.cliques, convAnt.cliques)} />
          <KpiCard compacto rotulo="Leads" valor={fmtInt(conv.leads)} delta={variacao(conv.leads, convAnt.leads)} />
          <KpiCard compacto rotulo="CPL" valor={fmtMoeda(cpl(conv))} delta={variacao(cpl(conv), cpl(convAnt))} quedaEhBoa />
        </div>
      </SecaoCard>

      <SecaoCard titulo="Sponsored Content · Carrossel e Imagem">
        <p className="mb-3 text-xs text-wam-muted">
          Anúncios no feed: carrossel de cases e imagem única.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard compacto rotulo="Investimento" valor={fmtMoeda(spon.custo)} delta={variacao(spon.custo, sponAnt.custo)} />
          <KpiCard compacto rotulo="Impressões" valor={fmtInt(spon.impressoes)} delta={variacao(spon.impressoes, sponAnt.impressoes)} />
          <KpiCard compacto rotulo="Cliques" valor={fmtInt(spon.cliques)} delta={variacao(spon.cliques, sponAnt.cliques)} />
          <KpiCard compacto rotulo="CTR" valor={fmtPct(ctr(spon))} delta={variacao(ctr(spon), ctr(sponAnt))} />
          <KpiCard compacto rotulo="Leads" valor={fmtInt(spon.leads)} delta={variacao(spon.leads, sponAnt.leads)} />
          <KpiCard compacto rotulo="CPL" valor={fmtMoeda(cpl(spon))} delta={variacao(cpl(spon), cpl(sponAnt))} quedaEhBoa />
        </div>
      </SecaoCard>

      <SecaoCard titulo="Campanhas" tom="alt">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-wam-border text-left text-xs uppercase tracking-wide text-wam-muted">
                <th className="py-2 pr-3 font-semibold">Campanha</th>
                <th className="py-2 pr-3 font-semibold">Formato</th>
                <th className="py-2 pr-3 text-right font-semibold">Impr./Envios</th>
                <th className="py-2 pr-3 text-right font-semibold">Cliques</th>
                <th className="py-2 pr-3 text-right font-semibold">CTR/Abertura</th>
                <th className="py-2 pr-3 text-right font-semibold">Custo</th>
                <th className="py-2 pr-3 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">CPL</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.campanha} className="border-b border-wam-border last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-wam-ink">{l.campanha}</td>
                  <td className="py-2.5 pr-3 text-wam-muted">{NOME_FORMATO[l.formato]}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.volume)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.cliques)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">
                    {fmtPct(l.taxa)}
                    <span className="ml-1 text-xs text-wam-muted">{l.ehConversation ? 'abert.' : 'CTR'}</span>
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtMoeda(l.custo)}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-wam-ink">{fmtInt(l.leads)}</td>
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
