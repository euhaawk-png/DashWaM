# DashWaM · Relatório de Mídia Paga

Dashboard exclusivo da WaM para acompanhamento de Google Ads (Search) e LinkedIn Ads.
React + Vite + TypeScript, Tailwind CSS, Recharts e PapaParse. Sem backend: os dados
entram por CSV.

## Como rodar

```bash
npm install
npm run dev
```

O app abre em http://localhost:5173. Para gerar o build de produção: `npm run build`
(saída em `dist/`).

## Deploy na Vercel

Basta importar o repositório na Vercel: o preset "Vite" já detecta
`npm run build` e a pasta `dist`. Nenhuma configuração extra é necessária.

## Como trocar os CSVs

Os arquivos ficam na pasta `data/` e são lidos no build:

- `data/google_ads.csv`: export do Google Ads por dia e campanha, com as colunas
  `data, campanha, palavra_chave, impressoes, cliques, custo, conversoes`.
  A coluna `palavra_chave` é opcional: sem ela, a tabela da página Google agrupa só
  por campanha. No Google, leads = conversões da conta.
- `data/linkedin.csv`: export do Campaign Manager por dia e campanha, com as colunas
  `data, campanha, formato, impressoes, cliques, custo, leads, envios, aberturas`.
  `formato` aceita Conversation, Carrossel ou Imagem. Leads vêm dos Lead Gen Forms;
  `envios` e `aberturas` valem só para Conversation Ads.

Formatos aceitos: datas em `aaaa-mm-dd` ou `dd/mm/aaaa`; números com ponto decimal
ou no padrão brasileiro (`1.234,56`). Depois de substituir os arquivos, rode o dev
ou o build de novo.

## Onde ficam as cores e fontes

Tudo em um único arquivo de tokens: `src/theme/tokens.ts` (cores da identidade,
cores das séries dos gráficos, cores dos deltas e fontes). O Tailwind e os gráficos
leem desse arquivo, então basta editar ali.

## Métricas calculadas

- CPL = custo / leads
- CTR = cliques / impressões
- CPC = custo / cliques
- Taxa de conversão = conversões / cliques (Google)
- Taxa de abertura = aberturas / envios (Conversation Ads)

Os deltas dos cards comparam o período selecionado com o período imediatamente
anterior de mesma duração. Leads de Google (conversões) e de LinkedIn (Lead Gen
Forms) têm origens separadas e não são somados em duplicidade.

## TODO: plugar as APIs

Hoje a leitura é feita em `src/lib/data.ts` a partir dos CSVs. Para automatizar:

- [ ] Google Ads API: relatório GAQL por dia, campanha e palavra-chave
      (`metrics.impressions`, `metrics.clicks`, `metrics.cost_micros`,
      `metrics.conversions`), convertendo cada linha para o modelo `Registro`.
- [ ] LinkedIn Marketing API: `adAnalytics` com pivot CAMPAIGN e granularidade
      DAILY (`impressions`, `clicks`, `costInLocalCurrency`, `oneClickLeads`,
      `sends`, `opens`), também convertendo para `Registro`.
- [ ] Como o app é estático, a integração pode ser um script agendado que gera os
      CSVs, ou uma function (na própria Vercel) servindo os dados já normalizados.
