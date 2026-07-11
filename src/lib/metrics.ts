import type { FiltroPlataforma, Periodo, Registro } from '../types';

export interface Totais {
  custo: number;
  impressoes: number;
  cliques: number;
  leads: number;
  envios: number;
  aberturas: number;
}

export function somar(registros: Registro[]): Totais {
  const t: Totais = { custo: 0, impressoes: 0, cliques: 0, leads: 0, envios: 0, aberturas: 0 };
  for (const r of registros) {
    t.custo += r.custo;
    t.impressoes += r.impressoes;
    t.cliques += r.cliques;
    t.leads += r.leads;
    t.envios += r.envios;
    t.aberturas += r.aberturas;
  }
  return t;
}

/** Divisão segura: retorna null quando o denominador é zero */
export function razao(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null;
}

export const cpl = (t: Totais) => razao(t.custo, t.leads);
export const ctr = (t: Totais) => razao(t.cliques, t.impressoes);
export const cpc = (t: Totais) => razao(t.custo, t.cliques);
/** Google: conversões / cliques */
export const taxaConv = (t: Totais) => razao(t.leads, t.cliques);
/** Conversation Ads: aberturas / envios */
export const taxaAbertura = (t: Totais) => razao(t.aberturas, t.envios);

/** Variação relativa entre períodos; null quando não dá para comparar */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return (atual - anterior) / anterior;
}

export function filtrar(
  registros: Registro[],
  periodo: Periodo,
  plataforma: FiltroPlataforma,
): Registro[] {
  return registros.filter(
    (r) =>
      r.data >= periodo.inicio &&
      r.data <= periodo.fim &&
      (plataforma === 'Todas' || r.plataforma === plataforma),
  );
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function duracaoDias(periodo: Periodo): number {
  const a = new Date(periodo.inicio + 'T12:00:00Z').getTime();
  const b = new Date(periodo.fim + 'T12:00:00Z').getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/** Período imediatamente anterior, com a mesma duração */
export function periodoAnterior(periodo: Periodo): Periodo {
  const dias = duracaoDias(periodo);
  return {
    inicio: somarDias(periodo.inicio, -dias),
    fim: somarDias(periodo.inicio, -1),
  };
}

export interface DiaAgregado extends Totais {
  data: string;
}

/** Agrega registros por dia (datas em ordem crescente) */
export function porDia(registros: Registro[]): DiaAgregado[] {
  const mapa = new Map<string, DiaAgregado>();
  for (const r of registros) {
    const atual =
      mapa.get(r.data) ??
      ({ data: r.data, custo: 0, impressoes: 0, cliques: 0, leads: 0, envios: 0, aberturas: 0 } as DiaAgregado);
    atual.custo += r.custo;
    atual.impressoes += r.impressoes;
    atual.cliques += r.cliques;
    atual.leads += r.leads;
    atual.envios += r.envios;
    atual.aberturas += r.aberturas;
    mapa.set(r.data, atual);
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Agrupa registros por uma chave arbitrária e soma as métricas */
export function agrupar<T extends string>(
  registros: Registro[],
  chave: (r: Registro) => T,
): Map<T, Registro[]> {
  const mapa = new Map<T, Registro[]>();
  for (const r of registros) {
    const k = chave(r);
    const lista = mapa.get(k);
    if (lista) lista.push(r);
    else mapa.set(k, [r]);
  }
  return mapa;
}
