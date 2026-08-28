import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { waTemplates, whatsappAccounts } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { EmbeddedSignupButton } from "@/components/EmbeddedSignupButton";
import { createTemplateAction, refreshWaStatusAction, syncTemplatesAction } from "../actions";

export const metadata = { title: "Conexão WhatsApp" };
export const dynamic = "force-dynamic";

const QUALITY_LABEL: Record<string, string> = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa" };

export default async function WhatsappSettingsPage() {
  const ctx = await requireRole("owner");
  const { account, templates } = await withTenant(
    ctx.tenant.id,
    async (tx) => ({
      account: (
        await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
      )[0],
      templates: await tx.select().from(waTemplates).where(eq(waTemplates.tenantId, ctx.tenant.id)),
    }),
    { userId: ctx.user.id }
  );

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-4 font-semibold">Conexão do número</h2>
        {!account ? (
          <div>
            <p className="mb-4 text-sm text-muted">
              Conecte o WhatsApp da empresa pela API oficial da Meta (Cloud API). Sem QR code, sem risco de
              banimento — a conexão é feita direto com o Facebook da empresa.
            </p>
            {process.env.META_APP_ID && process.env.META_ES_CONFIG_ID ? (
              <EmbeddedSignupButton appId={process.env.META_APP_ID} configId={process.env.META_ES_CONFIG_ID} />
            ) : (
              <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">
                A plataforma ainda não configurou o app da Meta (META_APP_ID / META_ES_CONFIG_ID).
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Status</span>
              <span className={`badge ${account.status === "connected" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
                {account.status === "connected" ? "Conectado" : "Com problema"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Número</span>
              <span className="font-medium">{account.displayPhone ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Nome exibido</span>
              <span>{account.verifiedName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Qualidade do número</span>
              <span>{account.qualityRating ? (QUALITY_LABEL[account.qualityRating] ?? account.qualityRating) : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Limite de mensagens</span>
              <span>{account.messagingLimit ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Último webhook recebido</span>
              <span>{account.lastWebhookAt ? new Date(account.lastWebhookAt).toLocaleString("pt-BR") : "nunca"}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <form action={refreshWaStatusAction}>
                <button type="submit" className="btn-secondary">Atualizar status</button>
              </form>
              {process.env.META_APP_ID && process.env.META_ES_CONFIG_ID && (
                <EmbeddedSignupButton appId={process.env.META_APP_ID} configId={process.env.META_ES_CONFIG_ID} />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card max-w-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Templates de mensagem</h2>
          <form action={syncTemplatesAction}>
            <button type="submit" className="btn-secondary text-xs">Sincronizar com a Meta</button>
          </form>
        </div>
        <p className="mb-4 text-sm text-muted">
          Fora da janela de 24h, só é possível iniciar conversa com um template aprovado pela Meta.
        </p>
        <div className="mb-5 space-y-2">
          {templates.length === 0 && <p className="text-sm text-muted">Nenhum template criado ainda.</p>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                <div className="truncate text-xs text-muted">{t.body}</div>
              </div>
              <span
                className={`badge ml-3 shrink-0 ${
                  t.status === "APPROVED" ? "bg-ok/10 text-ok" : t.status === "REJECTED" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"
                }`}
              >
                {t.status === "APPROVED" ? "Aprovado" : t.status === "REJECTED" ? "Rejeitado" : "Em análise"}
              </span>
            </div>
          ))}
        </div>
        <h3 className="mb-2 text-sm font-semibold">Novo template</h3>
        <ActionForm action={createTemplateAction} submitLabel="Enviar para aprovação">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="tname">Nome (ex.: retomada_contato)</label>
              <input id="tname" name="name" required pattern="[a-z0-9_]+" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="tcat">Categoria</label>
              <select id="tcat" name="category" className="input" defaultValue="UTILITY">
                <option value="UTILITY">Utilidade</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="tbody">Texto da mensagem</label>
            <textarea id="tbody" name="body" rows={3} required className="input" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
