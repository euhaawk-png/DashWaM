import { useMemo, useState } from 'react';
import { Header, type Aba } from './components/Header';
import { carregarRegistros } from './lib/data';
import { filtrar, periodoAnterior, somarDias } from './lib/metrics';
import { fmtData } from './lib/format';
import { GoogleAds } from './pages/GoogleAds';
import { LinkedInAds } from './pages/LinkedInAds';
import { VisaoGeral } from './pages/VisaoGeral';
import type { FiltroPlataforma, Periodo } from './types';

export default function App() {
  const registros = useMemo(carregarRegistros, []);

  const { dataMin, dataMax } = useMemo(() => {
    let min = '9999-12-31';
    let max = '0000-01-01';
    for (const r of registros) {
      if (r.data < min) min = r.data;
      if (r.data > max) max = r.data;
    }
    return { dataMin: min, dataMax: max };
  }, [registros]);

  const [aba, setAba] = useState<Aba>('visao');
  const [plataforma, setPlataforma] = useState<FiltroPlataforma>('Todas');
  // Período padrão: últimos 30 dias com dados
  const [periodo, setPeriodo] = useState<Periodo>(() => ({
    inicio: somarDias(dataMax, -29) > dataMin ? somarDias(dataMax, -29) : dataMin,
    fim: dataMax,
  }));

  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);
  const atuais = useMemo(
    () => filtrar(registros, periodo, plataforma),
    [registros, periodo, plataforma],
  );
  const anteriores = useMemo(
    () => filtrar(registros, anterior, plataforma),
    [registros, anterior, plataforma],
  );

  return (
    <div className="min-h-screen w-full bg-wam-bg">
      <Header
        aba={aba}
        onAba={setAba}
        periodo={periodo}
        onPeriodo={setPeriodo}
        plataforma={plataforma}
        onPlataforma={setPlataforma}
        dataMin={dataMin}
        dataMax={dataMax}
      />
      <main className="w-full px-4 py-5 sm:px-6">
        <p className="mb-4 text-xs text-wam-muted">
          Período: {fmtData(periodo.inicio)} a {fmtData(periodo.fim)} · Comparado com{' '}
          {fmtData(anterior.inicio)} a {fmtData(anterior.fim)}
        </p>
        {aba === 'visao' && <VisaoGeral atuais={atuais} anteriores={anteriores} />}
        {aba === 'google' && (
          <GoogleAds atuais={atuais} anteriores={anteriores} plataformaFiltro={plataforma} />
        )}
        {aba === 'linkedin' && (
          <LinkedInAds atuais={atuais} anteriores={anteriores} plataformaFiltro={plataforma} />
        )}
      </main>
      <footer className="w-full border-t border-wam-border px-4 py-4 text-xs text-wam-muted sm:px-6">
        Dashboard exclusivo da WaM · Fontes: Google Ads (Search) e LinkedIn Campaign Manager
      </footer>
    </div>
  );
}
