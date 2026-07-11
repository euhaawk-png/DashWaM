import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { colors, platformColors } from '../theme/tokens';
import { fmtCompacto, fmtDia, fmtInt, fmtMoedaCompacta } from '../lib/format';
import type { Plataforma } from '../types';

const eixoTick = { fontSize: 11, fill: colors.textSecondary } as const;
const eixoLinha = { stroke: colors.border } as const;

type Formatador = (v: number) => string;

/** Tooltip padrão: card branco com borda leve e valores formatados */
function TooltipWam({
  active,
  payload,
  label,
  formatadores,
  rotulo,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; fill?: string }[];
  label?: string;
  formatadores?: Record<string, Formatador>;
  rotulo?: (label: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-card border border-wam-border bg-wam-bg px-3 py-2 shadow-card">
      {label != null && (
        <p className="mb-1 text-xs font-semibold text-wam-ink">{rotulo ? rotulo(String(label)) : label}</p>
      )}
      {payload.map((item, i) => {
        const nome = item.name ?? '';
        const valorBruto = typeof item.value === 'number' ? item.value : Number(item.value ?? 0);
        const fmt = formatadores?.[nome] ?? fmtInt;
        return (
          <p key={i} className="flex items-center gap-2 text-xs text-wam-muted">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: item.color ?? item.fill ?? colors.series1 }}
            />
            {nome}: <span className="font-semibold text-wam-ink">{fmt(valorBruto)}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Legenda enxuta em texto neutro com quadradinho colorido */
export function LegendaSimples({ itens }: { itens: { cor: string; nome: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {itens.map((item) => (
        <span key={item.nome} className="flex items-center gap-1.5 text-xs text-wam-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.cor }} />
          {item.nome}
        </span>
      ))}
    </div>
  );
}

export interface PontoDiario {
  data: string;
  barra: number;
  linha: number;
}

/**
 * Barras + linha por dia (ex.: Investimento + Leads).
 * Barras no acento; linha na série grafite.
 */
export function GraficoBarrasLinha({
  dados,
  nomeBarra,
  nomeLinha,
  fmtBarra,
  fmtLinha = fmtInt,
  moedaNoEixo = false,
}: {
  dados: PontoDiario[];
  nomeBarra: string;
  nomeLinha: string;
  fmtBarra: Formatador;
  fmtLinha?: Formatador;
  moedaNoEixo?: boolean;
}) {
  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={colors.border} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="data"
              tickFormatter={fmtDia}
              tick={eixoTick}
              axisLine={eixoLinha}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="esq"
              tick={eixoTick}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => (moedaNoEixo ? fmtMoedaCompacta(v) : fmtCompacto(v))}
            />
            <YAxis
              yAxisId="dir"
              orientation="right"
              tick={eixoTick}
              axisLine={false}
              tickLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: colors.surface }}
              content={
                <TooltipWam
                  rotulo={fmtDia}
                  formatadores={{ [nomeBarra]: fmtBarra, [nomeLinha]: fmtLinha }}
                />
              }
            />
            <Bar
              yAxisId="esq"
              dataKey="barra"
              name={nomeBarra}
              fill={colors.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
            <Line
              yAxisId="dir"
              type="monotone"
              dataKey="linha"
              name={nomeLinha}
              stroke={colors.series2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: colors.background }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <LegendaSimples
        itens={[
          { cor: colors.series1, nome: nomeBarra },
          { cor: colors.series2, nome: nomeLinha },
        ]}
      />
    </div>
  );
}

/** Rosca de participação por plataforma (ex.: investimento) */
export function RoscaPorPlataforma({
  dados,
  fmtValor,
  totalRotulo,
}: {
  dados: { nome: Plataforma; valor: number }[];
  fmtValor: Formatador;
  totalRotulo: string;
}) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  return (
    <div>
      <div className="relative h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<TooltipWam formatadores={Object.fromEntries(dados.map((d) => [d.nome, fmtValor]))} />} />
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke={colors.background}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {dados.map((d) => (
                <Cell key={d.nome} fill={platformColors[d.nome]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-wam-muted">{totalRotulo}</span>
          <span className="font-heading text-lg font-bold text-wam-ink">{fmtValor(total)}</span>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {dados.map((d) => (
          <p key={d.nome} className="flex items-center gap-1.5 text-xs text-wam-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: platformColors[d.nome] }} />
            {d.nome}:{' '}
            <span className="font-semibold text-wam-ink">
              {fmtValor(d.valor)}
              {total > 0 &&
                ` (${((d.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontais por plataforma (ex.: leads) */
export function BarrasHorizontaisPorPlataforma({
  dados,
  fmtValor = fmtInt,
}: {
  dados: { nome: Plataforma; valor: number }[];
  fmtValor?: Formatador;
}) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 8, right: 48, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={colors.border} strokeWidth={1} horizontal={false} />
          <XAxis type="number" tick={eixoTick} axisLine={eixoLinha} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="nome" tick={eixoTick} axisLine={false} tickLine={false} width={72} />
          <Tooltip
            cursor={{ fill: colors.surface }}
            content={<TooltipWam formatadores={{ Leads: fmtValor }} />}
          />
          <Bar dataKey="valor" name="Leads" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {dados.map((d) => (
              <Cell key={d.nome} fill={platformColors[d.nome]} />
            ))}
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: number) => fmtValor(v)}
              style={{ fill: colors.textPrimary, fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras verticais de uma série única (ex.: leads por formato) */
export function BarrasSimples({
  dados,
  nomeSerie,
  fmtValor = fmtInt,
}: {
  dados: { nome: string; valor: number }[];
  nomeSerie: string;
  fmtValor?: Formatador;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.border} strokeWidth={1} vertical={false} />
          <XAxis dataKey="nome" tick={eixoTick} axisLine={eixoLinha} tickLine={false} interval={0} />
          <YAxis tick={eixoTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: colors.surface }}
            content={<TooltipWam formatadores={{ [nomeSerie]: fmtValor }} />}
          />
          <Bar dataKey="valor" name={nomeSerie} fill={colors.series1} radius={[4, 4, 0, 0]} maxBarSize={24}>
            <LabelList
              dataKey="valor"
              position="top"
              formatter={(v: number) => fmtValor(v)}
              style={{ fill: colors.textPrimary, fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
