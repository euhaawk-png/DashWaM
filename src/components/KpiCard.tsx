import { fmtDelta } from '../lib/format';

export interface KpiProps {
  rotulo: string;
  valor: string;
  /** Variação relativa vs período anterior (ex.: 0.12 = +12%) */
  delta?: number | null;
  /** true quando queda é boa (ex.: CPL, CPC) */
  quedaEhBoa?: boolean;
  compacto?: boolean;
}

export function KpiCard({ rotulo, valor, delta, quedaEhBoa = false, compacto = false }: KpiProps) {
  let corDelta = 'text-wam-muted';
  let seta = '';
  if (delta != null && delta !== 0) {
    const subiu = delta > 0;
    const bom = quedaEhBoa ? !subiu : subiu;
    corDelta = bom ? 'text-wam-good' : 'text-wam-bad';
    seta = subiu ? '▲ ' : '▼ ';
  }
  return (
    <div className="rounded-card border border-wam-border bg-wam-surface-soft p-3 shadow-card sm:p-4">
      <p className="text-xs font-semibold text-wam-muted">{rotulo}</p>
      <p className={`mt-1 font-heading font-bold text-wam-ink ${compacto ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
        {valor}
      </p>
      <p className={`mt-1 text-xs font-semibold ${corDelta}`}>
        {delta == null ? 'sem comparação' : `${seta}${fmtDelta(delta)}`}
        <span className="ml-1 font-normal text-wam-muted">vs anterior</span>
      </p>
    </div>
  );
}
