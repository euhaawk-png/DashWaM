import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata = {
  title: "Política de privacidade",
  description: "Como o Ezo trata dados pessoais (LGPD).",
};

/* eslint-disable @next/next/no-img-element */

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="mb-8 inline-flex items-center gap-2">
        <img src={brand.symbolUrl} alt="" className="h-5 w-auto" />
        <span className="text-lg font-extrabold tracking-tight">Ezo</span>
      </Link>
      <h1 className="mb-6 text-2xl font-extrabold">Política de privacidade</h1>
      <div className="space-y-5 text-sm leading-relaxed text-gray-700">
        <p>
          Esta política descreve como o <strong>Ezo</strong>, produto do grupo Ezcala, trata dados pessoais em
          conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Quais dados tratamos</h2>
        <p>
          O Ezo é um CRM usado por empresas clientes para atender seus próprios contatos. Em nome dessas
          empresas (controladoras), tratamos: dados de contato de leads e clientes (nome, telefone, e-mail),
          conteúdo das conversas de WhatsApp mantidas com a empresa, dados de formulários preenchidos pelo
          titular e registros de origem da captação (campanha, UTMs). Dos usuários do sistema, tratamos nome,
          e-mail corporativo e registros de acesso.
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Para que usamos</h2>
        <p>
          Exclusivamente para a prestação do serviço: atendimento comercial, gestão de funil de vendas e
          relatórios da própria empresa contratante. Não vendemos dados pessoais nem os usamos para
          publicidade de terceiros.
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Compartilhamento</h2>
        <p>
          As mensagens de WhatsApp trafegam pela API oficial da Meta (WhatsApp Cloud API), sujeita aos termos
          da Meta. Usamos provedores de infraestrutura (hospedagem e banco de dados) contratados sob
          obrigações de confidencialidade e segurança. Cada empresa só acessa os dados dos seus próprios
          contatos — o isolamento é garantido em nível de banco de dados.
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Segurança e retenção</h2>
        <p>
          Adotamos criptografia de credenciais em repouso, controle de acesso por papéis, registro de
          auditoria e comunicação cifrada (HTTPS). Os dados são mantidos enquanto durar o contrato com a
          empresa cliente ou até solicitação de exclusão.
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Seus direitos (titulares)</h2>
        <p>
          Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade e exclusão dos seus
          dados. Se você é contato de uma empresa que usa o Ezo, dirija o pedido à própria empresa
          (controladora); o Ezo, como operador, dá suporte técnico ao atendimento — incluindo exportação e
          exclusão definitiva sob demanda.
        </p>
        <h2 className="pt-2 text-base font-semibold text-ink">Contato</h2>
        <p>
          Dúvidas sobre esta política ou pedidos relacionados a dados pessoais:{" "}
          <a href={brand.ezcalaWhatsappUrl} className="text-accent hover:underline" target="_blank" rel="noreferrer">
            fale com a Ezcala
          </a>
          .
        </p>
        <p className="pt-4 text-xs text-muted">Última atualização: outubro de 2026.</p>
      </div>
    </div>
  );
}
