import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { messages, stages, pipelines, whatsappAccounts } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { onboardingStepAction } from "./actions";

export const metadata = { title: "Primeiros passos" };
export const dynamic = "force-dynamic";

const STEPS = [
  "Dados da empresa",
  "Conectar WhatsApp",
  "Convidar o time",
  "Configurar funil",
  "Captação de leads",
  "Teste guiado",
];

export default async function OnboardingPage() {
  const ctx = await requireRole("owner");
  const step = Math.min(ctx.tenant.settings.onboardingStep ?? 0, 5);

  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const account = (
        await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
      )[0];
      const pipeline = (
        await tx
          .select()
          .from(pipelines)
          .where(and(eq(pipelines.tenantId, ctx.tenant.id), eq(pipelines.isDefault, true)))
          .limit(1)
      )[0];
      const stageRows = pipeline
        ? await tx.select().from(stages).where(eq(stages.pipelineId, pipeline.id))
        : [];
      const inbound = (
        await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.tenantId, ctx.tenant.id), eq(messages.direction, "in")))
          .limit(1)
      )[0];
      return { connected: Boolean(account), stages: stageRows, hasInbound: Boolean(inbound) };
    },
    { userId: ctx.user.id }
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-xl font-extrabold">Primeiros passos</h1>
      <p className="mb-6 text-sm text-muted">
        Configure sua conta em poucos minutos. Seu progresso fica salvo — você pode voltar quando quiser.
      </p>

      <ol className="mb-8 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
              i < step ? "bg-ok/10 text-ok" : i === step ? "bg-accent text-white" : "bg-gray-100 text-muted"
            }`}
          >
            {i < step ? "✓" : i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="card p-6">
        {step === 0 && (
          <form action={onboardingStepAction} className="space-y-4">
            <input type="hidden" name="step" value={1} />
            <h2 className="font-semibold">1. Dados da empresa</h2>
            <div>
              <label className="label">Nome da empresa</label>
              <input name="companyName" defaultValue={ctx.tenant.name} required className="input" />
            </div>
            <div>
              <label className="label">Segmento (opcional)</label>
              <input name="segment" defaultValue={ctx.tenant.settings.segment ?? ""} className="input" placeholder="Ex.: clínica odontológica" />
            </div>
            <button type="submit" className="btn-primary">Continuar</button>
          </form>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold">2. Conectar o WhatsApp da empresa</h2>
            {data.connected ? (
              <p className="text-sm text-ok">WhatsApp conectado. ✓</p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  A conexão usa a API oficial da Meta (sem QR code). Você vai precisar do login do Facebook da
                  empresa. Pode pular e conectar depois em Configurações → WhatsApp.
                </p>
                <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-gray-700">
                  💡 Custo da Meta (desde 01/10/2026): receber mensagens é grátis e cada número tem 1.000
                  respostas grátis por mês; acima disso a Meta cobra ~R$ 0,035 por mensagem entregue, direto na
                  conta da sua empresa (anúncio clique-para-WhatsApp dá 72h livres). O Ezo não cobra por
                  mensagem nem por atendente — você acompanha a franquia em Configurações → WhatsApp.
                </p>
              </>
            )}
            <div className="flex gap-2">
              {!data.connected && (
                <Link href="/app/configuracoes/whatsapp" className="btn-primary">Conectar agora</Link>
              )}
              <form action={onboardingStepAction}>
                <input type="hidden" name="step" value={2} />
                <button type="submit" className={data.connected ? "btn-primary" : "btn-secondary"}>
                  {data.connected ? "Continuar" : "Pular por enquanto"}
                </button>
              </form>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold">3. Convidar o time</h2>
            <p className="text-sm text-muted">
              Convide vendedores e gerentes em Configurações → Equipe. Cada convidado define a própria senha
              no primeiro acesso.
            </p>
            <div className="flex gap-2">
              <Link href="/app/configuracoes/equipe" className="btn-primary">Convidar agora</Link>
              <form action={onboardingStepAction}>
                <input type="hidden" name="step" value={3} />
                <button type="submit" className="btn-secondary">Continuar</button>
              </form>
            </div>
          </div>
        )}

        {step === 3 && (
          <form action={onboardingStepAction} className="space-y-4">
            <input type="hidden" name="step" value={4} />
            <h2 className="font-semibold">4. Configurar o funil de vendas</h2>
            <p className="text-sm text-muted">Use o funil padrão ou renomeie as etapas abaixo.</p>
            <div className="space-y-2">
              {data.stages
                .sort((a, b) => a.position - b.position)
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.kind === "won" ? "bg-ok" : s.kind === "lost" ? "bg-danger" : "bg-accent"}`} />
                    <input name={`stage:${s.id}`} defaultValue={s.name} className="input py-1.5 text-sm" />
                  </div>
                ))}
            </div>
            <button type="submit" className="btn-primary">Salvar e continuar</button>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold">5. Captação de leads (opcional)</h2>
            <p className="text-sm text-muted">
              Crie um formulário para suas landing pages ou uma conexão de entrada (Google Ads, WordPress).
            </p>
            <div className="flex gap-2">
              <Link href="/app/formularios" className="btn-secondary">Criar formulário</Link>
              <Link href="/app/integracoes" className="btn-secondary">Criar conexão</Link>
              <form action={onboardingStepAction}>
                <input type="hidden" name="step" value={5} />
                <button type="submit" className="btn-primary">Continuar</button>
              </form>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold">6. Teste guiado</h2>
            <p className="text-sm text-muted">
              Pegue seu celular e envie uma mensagem de WhatsApp para o número conectado da empresa. Ela deve
              aparecer no Inbox em poucos segundos.
            </p>
            {data.hasInbound ? (
              <p className="text-sm text-ok">Mensagem recebida — está tudo funcionando! 🎉</p>
            ) : (
              <p className="text-sm text-warn">Ainda não recebemos nenhuma mensagem. Envie e clique em “Verificar”.</p>
            )}
            <div className="flex gap-2">
              <Link href="/app/onboarding" className="btn-secondary">Verificar</Link>
              <form action={onboardingStepAction}>
                <input type="hidden" name="step" value={6} />
                <button type="submit" className="btn-primary">Concluir configuração</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
