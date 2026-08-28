import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { inboundWebhooks } from "@/db/schema";
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

export default async function IntegrationsPage() {
  const ctx = await requireRole("owner");
  const hooks = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select()
        .from(inboundWebhooks)
        .where(eq(inboundWebhooks.tenantId, ctx.tenant.id))
        .orderBy(desc(inboundWebhooks.createdAt)),
    { userId: ctx.user.id }
  );
  const appUrl = process.env.APP_URL ?? "";
  const metaEnabled = process.env.META_LEADGEN_ENABLED === "true";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-xl font-bold">Integrações de entrada</h1>
      <p className="mb-6 text-sm text-muted">
        Receba leads do Google Ads, WordPress e outras origens direto no CRM — sem Make ou Zapier.
      </p>

      <div className="mb-8 space-y-4">
        {hooks.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">
            Nenhuma conexão de entrada ainda. Crie a primeira abaixo.
          </div>
        )}
        {hooks.map((h) => (
          <div key={h.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{h.name}</h2>
                  <span className="badge bg-gray-100 text-gray-600">{TYPE_LABEL[h.type]}</span>
                  <span className={`badge ${h.active ? "bg-ok/10 text-ok" : "bg-gray-100 text-gray-500"}`}>
                    {h.active ? "Ativa" : "Pausada"}
                  </span>
                </div>
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

      <div className="card p-5">
        <h2 className="mb-4 font-semibold">Nova conexão</h2>
        <ActionForm action={createWebhookAction} submitLabel="Criar conexão">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="wtype">Tipo</label>
              <select id="wtype" name="type" className="input" defaultValue="google_ads">
                <option value="google_ads">Google Ads Lead Form</option>
                <option value="wordpress">WordPress (Elementor, CF7, WPForms…)</option>
                <option value="generic">Webhook genérico</option>
                {metaEnabled && <option value="meta_leadgen">Meta Lead Ads</option>}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="wname">Nome</label>
              <input id="wname" name="name" required className="input" placeholder="Ex.: Campanha institucional" />
            </div>
          </div>
          {metaEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="pageId">ID da Página (Meta)</label>
                <input id="pageId" name="pageId" className="input" placeholder="somente para Meta Lead Ads" />
              </div>
              <div>
                <label className="label" htmlFor="pageToken">Token da Página</label>
                <input id="pageToken" name="pageToken" className="input" placeholder="somente para Meta Lead Ads" />
              </div>
            </div>
          )}
        </ActionForm>
      </div>
    </div>
  );
}
