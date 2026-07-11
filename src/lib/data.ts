import Papa from 'papaparse';
import type { Formato, Registro } from '../types';
import googleCsv from '../../data/google_ads.csv?raw';
import linkedinCsv from '../../data/linkedin.csv?raw';

/**
 * Leitura e normalização dos CSVs.
 * Os arquivos ficam em /data e são embutidos no build (troque-os e rode o dev/build de novo).
 *
 * TODO (integração futura via API, substituindo os CSVs):
 *  - Google Ads API: relatório GAQL por dia/campanha/palavra-chave
 *    (metrics.impressions, clicks, cost_micros, conversions).
 *  - LinkedIn Marketing API: adAnalytics por campanha com pivot CAMPAIGN e
 *    granularidade DAILY (impressions, clicks, costInLocalCurrency,
 *    oneClickLeads/externalWebsiteConversions, sends, opens).
 *  Basta trocar as funções abaixo por chamadas que retornem Registro[].
 */

/** Converte número em formato brasileiro ("1.234,56") ou padrão ("1234.56") */
function numero(valor: string | undefined): number {
  if (!valor) return 0;
  let s = String(valor).trim().replace(/R\$\s?/, '');
  if (s === '') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Aceita datas em aaaa-mm-dd ou dd/mm/aaaa */
function dataIso(valor: string | undefined): string {
  const s = (valor ?? '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s.slice(0, 10);
}

function parse(csv: string): Record<string, string>[] {
  const resultado = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return resultado.data;
}

function normalizarGoogle(csv: string): Registro[] {
  return parse(csv).map((linha) => ({
    data: dataIso(linha.data),
    plataforma: 'Google' as const,
    formato: 'Search' as const,
    campanha: (linha.campanha ?? '').trim(),
    palavraChave: linha.palavra_chave?.trim() || undefined,
    impressoes: numero(linha.impressoes),
    cliques: numero(linha.cliques),
    custo: numero(linha.custo),
    // No Google, leads = conversões da conta
    leads: numero(linha.conversoes),
    envios: 0,
    aberturas: 0,
  }));
}

function normalizarLinkedIn(csv: string): Registro[] {
  return parse(csv).map((linha) => {
    const formatoBruto = (linha.formato ?? '').trim().toLowerCase();
    const formato: Formato = formatoBruto.startsWith('conv')
      ? 'Conversation'
      : formatoBruto.startsWith('carr')
        ? 'Carrossel'
        : 'Imagem';
    return {
      data: dataIso(linha.data),
      plataforma: 'LinkedIn' as const,
      formato,
      campanha: (linha.campanha ?? '').trim(),
      impressoes: numero(linha.impressoes),
      cliques: numero(linha.cliques),
      custo: numero(linha.custo),
      // No LinkedIn, leads vêm dos Lead Gen Forms
      leads: numero(linha.leads),
      envios: numero(linha.envios),
      aberturas: numero(linha.aberturas),
    };
  });
}

export function carregarRegistros(): Registro[] {
  const registros = [...normalizarGoogle(googleCsv), ...normalizarLinkedIn(linkedinCsv)];
  return registros
    .filter((r) => r.data && r.campanha)
    .sort((a, b) => a.data.localeCompare(b.data));
}
