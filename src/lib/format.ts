/** Formatação numérica em pt-BR (R$ com milhar, percentual com vírgula) */

export function fmtMoeda(v: number | null): string {
  if (v == null || !isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtMoedaCompacta(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
}

export function fmtInt(v: number | null): string {
  if (v == null || !isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function fmtCompacto(v: number): string {
  return v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
}

export function fmtPct(v: number | null, casas = 2): string {
  if (v == null || !isFinite(v)) return '-';
  return (
    (v * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }) + '%'
  );
}

/** Variação percentual com sinal, ex.: +12,3% */
export function fmtDelta(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '-' : '';
  return (
    sinal +
    (Math.abs(v) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) +
    '%'
  );
}

/** dd/mm a partir de aaaa-mm-dd */
export function fmtDia(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

/** dd/mm/aaaa a partir de aaaa-mm-dd */
export function fmtData(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}
