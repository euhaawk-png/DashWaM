import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { inboundWebhooks, whatsappAccounts } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { createWebhookAction, deleteWebhookAction, toggleWebhookAction } from "./actions";

export const metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  google_ads: "Google Ads Lead Form",
  wordpress: "WordPress",
  generic: "Webhook genérico",
  meta_leadgen: "Meta Lead Ads",
};

function ConnectorCard({
  title,
  description,
  badge,
  badgeClass,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  badgeClass: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className={`badge shrink-0 ${badgeClass}`}>{badge}</span>
      </div>
      <p className="mb-4 flex-1 text-sm text-muted">{description}</p>
      {children}
    </div>
  );
}

export default async function IntegrationsPage() {
  const ctx = await requireRole("owner");
  const { hooks, waAccount } = await withTenant(
    ctx.tenant.id,
    async (tx) => ({
      hooks: await tx
        .select()
        .from(inboundWebhooks)
        .where(eq(inboundWebhooks.tenantId, ctx.tenant.id))
        .orderBy(desc(inboundWebhooks.createdAt)),
      waAccount: (
        await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
      )[0],
    }),
    { userId: ctx.user.id }
  );
  const appUrl = process.env.APP_URL ?? "";
  const metaEnabled = process.env.META_LEADGEN_ENABLED === "true";
  const waConnected = waAccount?.status === "connected";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-xl font-bold">Integrações</h1>
      <p className="mb-6 text-sm text-muted">
        Conecte as origens de leads da empresa — os leads caem direto no funil, sem Make ou Zapier.
      </p>

      {/* The 4 connectors */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2">
        <ConnectorCard
          title="WhatsApp"
          description="Conversas do número oficial da empresa viram leads no funil automaticamente."
          badge={waConnected ? "Conectado" : "Não conectado"}
          badgeClass={waConnected ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}
        >
          <Link href="/app/configuracoes/whatsapp" className={waConnected ? "btn-secondary" : "btn-primary"}>
            {waConnected ? "Ver conexão" : "Conectar WhatsApp"}
          </Link>
        </ConnectorCard>

        <ConnectorCard
          title="Google Ads Lead Form"
          description="O Google envia cada lead do formulário do anúncio direto para o Ezo, validado por chave."
          badge="Ativo"
          badgeClass="bg-ok/10 text-ok"
        >
          <ActionForm
            action={createWebhookAction}
            submitLabel="Criar conexão"
            className="flex items-end gap-2"
            submitClassName="btn-primary shrink-0"
          >
            <input type="hidden" name="type" value="google_ads" />
            <div className="flex-1">
              <label className="label text-xs">Nome da conexão</label>
              <input name="name" required className="input py-1.5 text-sm" placeholder="Ex.: Campanha institucional" />
            </div>
          </ActionForm>
        </ConnectorCard>

        <ConnectorCard
          title="WordPress / genérico"
          description="Elementor, Contact Form 7, WPForms ou qualquer sistema que envie POST — com mapeamento de campos visual."
          badge="Ativo"
          badgeClass="bg-ok/10 text-ok"
        >
          <ActionForm
            action={createWebhookAction}
            submitLabel="Criar conexão"
            className="flex items-end gap-2"
            submitClassName="btn-primary shrink-0"
          >
            <input type="hidden" name="type" value="wordpress" />
            <div className="flex-1">
              <label className="label text-xs">Nome da conexão</label>
              <input name="name" required className="input py-1.5 text-sm" placeholder="Ex.: Site institucional" />
            </div>
          </ActionForm>
        </ConnectorCard>

        <ConnectorCard
          title="Meta Lead Ads"
          description="Leads dos formulários do Facebook/Instagram, com busca assíncrona, fila e retentativa."
          badge={metaEnabled ? "Ativo" : "Aguardando aprovação da Meta"}
          badgeClass={metaEnabled ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}
        >
          {metaEnabled ? (
            <ActionForm action={createWebhookAction} submitLabel="Conectar Página" className="space-y-2">
              <input type="hidden" name="type" value="meta_leadgen" />
              <input name="name" required className="input py-1.5 text-sm" placeholder="Nome da conexão" />
              <div className="grid grid-cols-2 gap-2">
                <input name="pageId" required className="input py-1.5 text-sm" placeholder="ID da Página" />
                <input name="pageToken" required className="input py-1.5 text-sm" placeholder="Token da Página" />
              </div>
            </ActionForm>
          ) : (
            <button type="button" disabled className="btn-secondary cursor-not-allowed opacity-60">
              Disponível em breve
            </button>
          )}
        </ConnectorCard>
      </div>

      {/* Existing connections */}
      <h2 className="mb-3 font-semibold">Conexões criadas</h2>
      <div className="space-y-4">
        {hooks.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">
            Nenhuma conexão de entrada ainda. Crie a primeira nos cards acima.
          </div>
        )}
        {hooks.map((h) => (
          <div key={h.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{h.name}</h3>
                <span className="badge bg-gray-100 text-gray-600">{TYPE_LABEL[h.type]}</span>
                <span className={`badge ${h.active ? "bg-ok/10 text-ok" : "bg-gray-100 text-gray-500"}`}>
                  {h.active ? "Ativa" : "Pausada"}
                </span>
              </div>
              <div className="flex gap-2">
                <Link href={`/app/integracoes/${h.id}`} className="btn-secondary text-xs">
                  Detalhes e log
                </Link>
                <form action={toggleWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="active" value={h.active ? "false" : "true"} />
                  <button type="submit" className="btn-secondary text-xs">{h.active ? "Pausar" : "Ativar"}</button>
                </form>
                <form action={deleteWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <button type="submit" className="btn-danger text-xs">Excluir</button>
                </form>
              </div>
            </div>
            {h.type !== "meta_leadgen" ? (
              <div className="mt-3 text-xs">
                <span className="text-muted">URL de recebimento: </span>
                <code className="break-all rounded bg-gray-100 px-1">
                  {appUrl}/api/hooks/{ctx.tenant.slug}/{h.token}
                </code>
                <p className="mt-1 text-muted">
                  {h.type === "google_ads"
                    ? "Cole esta URL no formulário de lead do Google Ads e use a chave secreta como google_key."
                    : "Envie POST JSON ou form-encoded com a chave no header X-Api-Key (ou ?key=)."}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Página conectada: {String((h.meta as { pageId?: string }).pageId ?? "—")} · os leads chegam pelo
                webhook da plataforma com busca assíncrona e retentativa.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
