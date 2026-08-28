import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { contacts, dealEvents, deals, messages, stages, users } from "@/db/schema";
import { requireTenant } from "@/lib/auth/guard";
import { isManager, listTeam } from "@/lib/inbox";
import { formatPhone } from "@/lib/phone";
import { addDealNoteAction, openConversationAction } from "../../actions";
import { DealEditor } from "./DealEditor";

export const metadata = { title: "Negociação" };
export const dynamic = "force-dynamic";

function money(v: string | null): string {
  return v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requireTenant();
  const { dealId } = await params;
  const manager = isManager(ctx);

  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const deal = (
        await tx
          .select()
          .from(deals)
          .where(and(eq(deals.tenantId, ctx.tenant.id), eq(deals.id, dealId)))
          .limit(1)
      )[0];
      if (!deal) return null;
      if (!manager && deal.ownerId !== ctx.user.id) return null;
      const contact = (await tx.select().from(contacts).where(eq(contacts.id, deal.contactId)).limit(1))[0];
      const stageRows = await tx.select().from(stages).where(eq(stages.pipelineId, deal.pipelineId));
      const events = await tx
        .select({ event: dealEvents, userName: users.name })
        .from(dealEvents)
        .leftJoin(users, eq(users.id, dealEvents.userId))
        .where(eq(dealEvents.dealId, deal.id));
      const msgs = deal.conversationId
        ? await tx
            .select()
            .from(messages)
            .where(eq(messages.conversationId, deal.conversationId))
            .orderBy(messages.createdAt)
            .limit(200)
        : [];
      const team = manager ? await listTeam(tx, ctx.tenant.id) : [];
      const owner = deal.ownerId
        ? (await tx.select().from(users).where(eq(users.id, deal.ownerId)).limit(1))[0]
        : null;
      return { deal, contact, stages: stageRows, events, messages: msgs, team, owner };
    },
    { userId: ctx.user.id }
  );
  if (!data) notFound();
  const { deal, contact } = data;

  type TimelineItem = { at: Date; kind: string; text: string; who?: string | null };
  const timeline: TimelineItem[] = [
    ...data.events.map(({ event, userName }) => {
      const d = event.data as Record<string, unknown>;
      let text = "";
      switch (event.type) {
        case "created":
          text = `Negociação criada (origem: ${String(d.source ?? "—")})`;
          break;
        case "stage_change":
          text = `Movida para a etapa "${String(d.stageName ?? "")}"`;
          break;
        case "won":
          text = "Marcada como ganha 🎉";
          break;
        case "lost":
          text = `Marcada como perdida${d.lostReason ? ` — motivo: ${String(d.lostReason)}` : ""}`;
          break;
        case "note":
          text = `Nota: ${String(d.text ?? "")}`;
          break;
        default:
          text = event.type;
      }
      return { at: event.createdAt, kind: event.type, text, who: userName };
    }),
    ...data.messages
      .filter((m) => !m.isInternalNote)
      .map((m) => ({
        at: m.createdAt,
        kind: "message",
        text: `${m.direction === "in" ? "← Cliente" : "→ Enviada"}: ${(m.body ?? `[${m.type}]`).slice(0, 140)}`,
        who: null,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/pipeline" className="text-sm text-muted hover:text-ink">← Pipeline</Link>
          <h1 className="mt-1 text-xl font-bold">{contact?.name ?? deal.title}</h1>
          <p className="text-sm text-muted">
            {formatPhone(contact?.phone ?? null)}
            {contact?.email ? ` · ${contact.email}` : ""}
            {deal.source ? ` · origem: ${deal.source}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deal.wonAt && <span className="badge bg-ok/10 text-ok">Ganha · {money(deal.value)}</span>}
          {deal.lostAt && <span className="badge bg-danger/10 text-danger">Perdida</span>}
          <form action={openConversationAction}>
            <input type="hidden" name="dealId" value={deal.id} />
            <button type="submit" className="btn-primary">
              {deal.conversationId ? "Abrir conversa" : "Chamar no WhatsApp"}
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <DealEditor
            deal={{
              id: deal.id,
              title: deal.title,
              value: deal.value,
              product: deal.product,
              source: deal.source,
              stageId: deal.stageId,
              ownerId: deal.ownerId,
              lostReason: deal.lostReason,
              custom: deal.custom,
              wonAt: deal.wonAt?.toISOString() ?? null,
              lostAt: deal.lostAt?.toISOString() ?? null,
            }}
            stages={data.stages.sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
            team={data.team.map((t) => ({ userId: t.userId, name: t.name }))}
            isManager={manager}
          />
          <div className="card mt-4 p-4">
            <h2 className="mb-2 text-sm font-semibold text-muted">Adicionar nota</h2>
            <form action={addDealNoteAction} className="space-y-2">
              <input type="hidden" name="dealId" value={deal.id} />
              <textarea name="note" rows={2} required className="input text-sm" placeholder="Anotação interna da negociação…" />
              <button type="submit" className="btn-secondary text-sm">Salvar nota</button>
            </form>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted">Linha do tempo</h2>
            <div className="space-y-3">
              {timeline.length === 0 && <p className="text-sm text-muted">Sem eventos ainda.</p>}
              {timeline.map((item, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-28 shrink-0 text-xs text-muted">
                    {item.at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
                    {item.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="min-w-0">
                    <span className="whitespace-pre-wrap break-words">{item.text}</span>
                    {item.who && <span className="ml-1 text-xs text-muted">— {item.who}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
