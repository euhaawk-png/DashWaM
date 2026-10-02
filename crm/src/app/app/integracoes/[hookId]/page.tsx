import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { inboundWebhooks, webhookEvents } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";
import { reprocessEventAction, saveFieldMapAction } from "../actions";

export const metadata = { title: "Detalhes da integração" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  processed: "bg-ok/10 text-ok",
  received: "bg-warn/10 text-warn",
  failed: "bg-danger/10 text-danger",
  rejected: "bg-danger/10 text-danger",
};
const STATUS_LABEL: Record<string, string> = {
  processed: "Processado",
  received: "Recebido",
  failed: "Falhou",
  rejected: "Rejeitado (chave inválida)",
};

export default async function WebhookDetailPage({ params }: { params: Promise<{ hookId: string }> }) {
  const ctx = await requireRole("owner");
  const { hookId } = await params;
  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const hook = (
        await tx
          .select()
          .from(inboundWebhooks)
          .where(and(eq(inboundWebhooks.tenantId, ctx.tenant.id), eq(inboundWebhooks.id, hookId)))
          .limit(1)
      )[0];
      if (!hook) return null;
      const events = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.webhookId, hookId))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(30);
      return { hook, events };
    },
    { userId: ctx.user.id }
  );
  if (!data) notFound();
  const { hook, events } = data;

  const payloadKeys =
    hook.lastPayload && hook.type !== "google_ads"
      ? Object.keys(hook.lastPayload).filter((k) => {
          const value = (hook.lastPayload as Record<string, unknown>)[k];
          return typeof value === "string" || typeof value === "number";
        })
      : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/app/integracoes" className="text-sm text-muted hover:text-ink">← Integrações</Link>
      <h1 className="mb-6 mt-1 text-xl font-extrabold">{hook.name}</h1>

      {(hook.type === "wordpress" || hook.type === "generic") && (
        <div className="card mb-6 p-5">
          <h2 className="mb-2 font-semibold">Mapeamento de campos</h2>
          {payloadKeys.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhum payload recebido ainda. Envie um POST de teste da sua origem — o último payload
              aparece aqui para você mapear cada campo uma única vez.
            </p>
          ) : (
            <form action={saveFieldMapAction} className="space-y-2">
              <input type="hidden" name="id" value={hook.id} />
              {payloadKeys.map((key) => (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <code className="w-56 truncate rounded bg-gray-100 px-2 py-1 text-xs">{key}</code>
                  <span className="text-xs text-muted">
                    “{String((hook.lastPayload as Record<string, unknown>)[key]).slice(0, 40)}”
                  </span>
                  <select
                    name={`map:${key}`}
                    defaultValue={hook.fieldMap[key] ?? "extra"}
                    className="input ml-auto w-44 py-1 text-xs"
                  >
                    <option value="name">Nome do contato</option>
                    <option value="phone">Telefone</option>
                    <option value="email">E-mail</option>
                    <option value="extra">Campo extra</option>
                    <option value="ignore">Ignorar</option>
                  </select>
                </div>
              ))}
              <button type="submit" className="btn-primary mt-2">Salvar mapeamento</button>
            </form>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-line bg-gray-50 px-4 py-3 text-sm font-semibold">
          Últimos recebimentos
        </div>
        {events.length === 0 && <p className="p-5 text-sm text-muted">Nenhum evento recebido ainda.</p>}
        <div className="divide-y divide-line">
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`badge ${STATUS_BADGE[e.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                  <span className="text-xs text-muted">{e.createdAt.toLocaleString("pt-BR")}</span>
                </div>
                {e.error && <p className="mt-1 text-xs text-danger">{e.error}</p>}
                <pre className="mt-2 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                  {JSON.stringify(e.payload, null, 2).slice(0, 1200)}
                </pre>
              </div>
              {e.status !== "processed" && e.status !== "rejected" && (
                <form action={reprocessEventAction}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button type="submit" className="btn-secondary shrink-0 text-xs">Reprocessar</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
