import { LogoWam } from './LogoWam';
import type { FiltroPlataforma, Periodo } from '../types';

export type Aba = 'visao' | 'google' | 'linkedin';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'visao', rotulo: 'Visão Geral' },
  { id: 'google', rotulo: 'Google Ads · Search' },
  { id: 'linkedin', rotulo: 'LinkedIn Ads' },
];

interface HeaderProps {
  aba: Aba;
  onAba: (a: Aba) => void;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  plataforma: FiltroPlataforma;
  onPlataforma: (p: FiltroPlataforma) => void;
  dataMin: string;
  dataMax: string;
}

export function Header(props: HeaderProps) {
  const { aba, onAba, periodo, onPeriodo, plataforma, onPlataforma, dataMin, dataMax } = props;
  return (
    <header className="w-full border-b border-wam-border bg-wam-bg">
      <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <LogoWam size={44} />
          <div>
            <p className="font-heading text-2xl font-extrabold leading-none text-wam-ink">
              Wa<span className="text-wam-accent">M</span>
            </p>
            <p className="mt-0.5 text-sm text-wam-muted">Relatório de Mídia Paga</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-wam-muted">Período</span>
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={periodo.inicio}
                min={dataMin}
                max={periodo.fim}
                onChange={(e) => e.target.value && onPeriodo({ ...periodo, inicio: e.target.value })}
                className="rounded-tag border border-wam-border bg-wam-bg px-2 py-1.5 text-sm text-wam-ink outline-none focus:border-wam-accent"
              />
              <span className="text-xs text-wam-muted">a</span>
              <input
                type="date"
                value={periodo.fim}
                min={periodo.inicio}
                max={dataMax}
                onChange={(e) => e.target.value && onPeriodo({ ...periodo, fim: e.target.value })}
                className="rounded-tag border border-wam-border bg-wam-bg px-2 py-1.5 text-sm text-wam-ink outline-none focus:border-wam-accent"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-wam-muted">Plataforma</span>
            <select
              value={plataforma}
              onChange={(e) => onPlataforma(e.target.value as FiltroPlataforma)}
              className="rounded-tag border border-wam-border bg-wam-bg px-2 py-1.5 text-sm text-wam-ink outline-none focus:border-wam-accent"
            >
              <option value="Todas">Todas</option>
              <option value="Google">Google</option>
              <option value="LinkedIn">LinkedIn</option>
            </select>
          </label>
        </div>
      </div>

      <nav className="flex w-full gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Páginas do relatório">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <button
              key={a.id}
              onClick={() => onAba(a.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 font-heading text-sm font-semibold transition-colors ${
                ativa
                  ? 'border-wam-accent text-wam-ink'
                  : 'border-transparent text-wam-muted hover:text-wam-ink'
              }`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
