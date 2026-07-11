export type Plataforma = 'Google' | 'LinkedIn';

export type Formato = 'Search' | 'Conversation' | 'Carrossel' | 'Imagem';

export type FiltroPlataforma = 'Todas' | Plataforma;

/** Modelo único normalizado a partir dos CSVs de Google Ads e LinkedIn */
export interface Registro {
  /** Data no formato ISO (aaaa-mm-dd) */
  data: string;
  plataforma: Plataforma;
  formato: Formato;
  campanha: string;
  /** Presente apenas no Google Ads quando o CSV traz a coluna palavra_chave */
  palavraChave?: string;
  impressoes: number;
  cliques: number;
  custo: number;
  /** Google: conversões da conta · LinkedIn: leads de Lead Gen Forms */
  leads: number;
  /** Apenas Conversation Ads */
  envios: number;
  /** Apenas Conversation Ads */
  aberturas: number;
}

export interface Periodo {
  inicio: string;
  fim: string;
}
