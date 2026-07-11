/**
 * Tokens de identidade visual da WaM.
 * Edite as cores e fontes aqui: todo o app (Tailwind e gráficos) lê deste arquivo.
 */

export const colors = {
  /** Fundo geral da página */
  background: '#FFFFFF',
  /** Fundos alternados de seções e cards */
  surface: '#F5F5F5',
  surfaceSoft: '#F9F9F9',
  /** Acento principal: destaques, barras, deltas, linha ativa */
  accent: '#F93822',
  /** Texto principal */
  textPrimary: '#242424',
  /** Texto secundário e labels */
  textSecondary: '#6B6B6B',
  /** Bordas e linhas de grade */
  border: '#E6E6E6',
  /** Cor de apoio (uso pontual, ícones) */
  support: '#0E5AAF',

  /** Séries de gráficos (ordem fixa: nunca trocar a cor de uma entidade) */
  series1: '#F93822',
  series2: '#242424',
  series3: '#C7C7C7',

  /** Semântica dos deltas dos cards (queda de CPL é boa, por exemplo) */
  deltaGood: '#12805C',
  deltaBad: '#F93822',
} as const;

/** Cor fixa por plataforma, usada em gráficos, tags e legendas */
export const platformColors: Record<'Google' | 'LinkedIn', string> = {
  Google: colors.series1,
  LinkedIn: colors.series2,
};

export const fonts = {
  /** Títulos e números grandes */
  heading: "'Montserrat', sans-serif",
  /** Corpo do texto */
  body: "'Open Sans', sans-serif",
} as const;

/** Raio de canto padrão dos cards, em px */
export const radius = 12;
