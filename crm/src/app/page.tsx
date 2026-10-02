import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { absolute: "Ezo — CRM de atendimento no WhatsApp" },
  description:
    "Chegou lead, virou venda. O CRM onde seu time atende o WhatsApp da empresa, move o funil e você vê tudo.",
  openGraph: {
    title: "Ezo — CRM de atendimento no WhatsApp",
    description: "Chegou lead, virou venda.",
    images: [{ url: "/brand/ezo-og.png", width: 1200, height: 630 }],
    locale: "pt_BR",
    type: "website",
  },
};

/* eslint-disable @next/next/no-img-element */

const PROBLEMS = [
  {
    title: "Lead no celular do vendedor",
    text: "A conversa da empresa vive no WhatsApp pessoal. Vendedor saiu, o histórico e o cliente foram junto.",
  },
  {
    title: "Horas sem resposta",
    text: "O lead chega quente e esfria na fila. Ninguém sabe quem deveria atender nem quando respondeu.",
  },
  {
    title: "Gestão no escuro",
    text: "Sem funil, sem número: quanto entrou, quanto virou venda e onde está travando — ninguém sabe dizer.",
  },
];

const STEPS = [
  { title: "Lead chega", text: "Pelo WhatsApp da empresa, formulário do site, Google Ads ou Meta." },
  { title: "Distribuição automática", text: "A roleta entrega o lead para o vendedor certo, na hora." },
  { title: "Vendedor atende no Ezo", text: "Inbox em tempo real, no navegador, com todo o histórico." },
  { title: "Vira negociação no funil", text: "Cada conversa cria um card no kanban — nada se perde." },
  { title: "Venda registrada", text: "Ganho com valor, motivo de perda e relatório por vendedor." },
];

const FEATURES = [
  { title: "Inbox em tempo real", text: "Mensagem nova aparece na hora, sem apertar F5, com som e contador." },
  { title: "Funil kanban", text: "Arraste negociações entre etapas editáveis, com valor e responsável." },
  { title: "Formulário nativo + embed", text: "Link público ou iframe na sua landing page, com botão de WhatsApp." },
  { title: "Conexões de entrada", text: "Google Ads, Meta Lead Ads e site/WordPress direto no funil, sem Zapier." },
  { title: "Relatórios que importam", text: "Tempo de primeira resposta, leads por canal, conversão e produtividade." },
  { title: "Acessos por papel", text: "Vendedor vê o que é dele; gerente e dono veem tudo. No servidor, não só na tela." },
];

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">{kicker}</p>
      <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="bg-paper text-ink">
      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <img src={brand.symbolUrl} alt="" className="h-6 w-auto" />
          <span className="text-xl font-extrabold tracking-tight">Ezo</span>
        </div>
        <Link href="/login" className="btn-secondary">Entrar</Link>
      </header>

      {/* 1 — Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20">
        <img src={brand.symbolUrl} alt="" className="mx-auto mb-6 h-14 w-auto" />
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Chegou lead, <span className="text-accent">virou venda.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          O CRM onde seu time atende o WhatsApp da empresa, move o funil e você vê tudo.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={brand.ezcalaWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full px-6 py-3 text-base sm:w-auto"
          >
            Falar com a Ezcala
          </a>
          <Link href="/login" className="btn-secondary w-full px-6 py-3 text-base sm:w-auto">
            Entrar
          </Link>
        </div>
      </section>

      {/* 2 — O problema */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle kicker="O problema" title="Vender pelo WhatsApp sem sistema é vender no escuro" />
          <div className="grid gap-4 sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="card p-6">
                <h3 className="mb-2 font-semibold">{p.title}</h3>
                <p className="text-sm text-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Como funciona */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle kicker="Como funciona" title="Do primeiro oi ao fechamento, em um lugar só" />
          <ol className="mx-auto max-w-2xl space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Recursos */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle kicker="Recursos" title="Tudo que a operação comercial precisa na v1" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — WhatsApp oficial + custos Meta */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionTitle kicker="WhatsApp oficial" title="API oficial da Meta: sem QR code, sem risco de ban" />
          <div className="card p-6 sm:p-8">
            <p className="mb-5 text-sm text-muted">
              A conexão é feita direto com o Facebook da sua empresa, em minutos, pela API oficial (Cloud API).
              Nada de aparelho ligado na tomada, QR code ou gambiarra que derruba o número.
            </p>
            <h3 className="mb-3 font-semibold">Transparência de custo (regra da Meta desde 01/10/2026)</h3>
            <ul className="space-y-2 text-sm text-muted">
              <li>• <strong className="text-ink">Receber mensagens é grátis</strong>, sempre.</li>
              <li>• Cada número tem <strong className="text-ink">1.000 respostas grátis por mês</strong>.</li>
              <li>• Acima disso, a Meta cobra <strong className="text-ink">~R$ 0,035 por mensagem entregue</strong> no Brasil.</li>
              <li>• Conversa iniciada por <strong className="text-ink">anúncio clique-para-WhatsApp tem 72h livres</strong>.</li>
              <li>
                • O valor é <strong className="text-ink">pago direto à Meta</strong>, na conta da sua empresa — o Ezo
                não cobra por mensagem nem por atendente.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6 — Rodapé */}
      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <img src={brand.symbolUrl} alt="" className="h-6 w-auto" />
          <p className="text-sm text-muted">Ezo é uma empresa do grupo Ezcala.</p>
          <nav className="flex gap-6 text-sm">
            <Link href="/login" className="text-accent hover:underline">Entrar</Link>
            <Link href="/privacidade" className="text-accent hover:underline">Política de privacidade</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
