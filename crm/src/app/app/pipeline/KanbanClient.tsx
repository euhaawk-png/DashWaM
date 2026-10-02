"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";

type Stage = { id: string; name: string; kind: string };
type Deal = {
  id: string;
  title: string;
  value: string | null;
  stageId: string;
  ownerId: string | null;
  ownerName: string | null;
  source: string | null;
  stageEnteredAt: string;
  createdAt: string;
  wonAt: string | null;
  lostAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  conversationId: string | null;
};

function money(v: string | null): string {
  if (!v) return "";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function daysIn(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "hoje";
  return `${days}d na etapa`;
}

export function KanbanClient({
  stages,
  deals: initialDeals,
  team,
  isManager,
}: {
  stages: Stage[];
  deals: Deal[];
  team: Array<{ userId: string; name: string }>;
  isManager: boolean;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const sources = useMemo(
    () => Array.from(new Set(deals.map((d) => d.source).filter((s): s is string => Boolean(s)))),
    [deals]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (q && !`${d.title} ${d.contactName ?? ""} ${d.contactPhone ?? ""}`.toLowerCase().includes(q)) return false;
      if (ownerFilter && d.ownerId !== ownerFilter) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      return true;
    });
  }, [deals, search, ownerFilter, sourceFilter]);

  const moveDeal = async (dealId: string, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    const extra: Record<string, unknown> = {};
    if (stage?.kind === "lost") {
      const reason = window.prompt("Motivo da perda:");
      if (reason === null) return;
      extra.lostReason = reason || null;
    }
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stageId, stageEnteredAt: new Date().toISOString() } : d)));
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, ...extra }),
    });
    if (!res.ok) router.refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-3">
        <h1 className="mr-2 text-base font-semibold">Pipeline</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nome ou telefone…"
          className="input w-56 py-1.5 text-sm"
        />
        {isManager && (
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="input w-44 py-1.5 text-sm">
            <option value="">Todos os responsáveis</option>
            {team.map((t) => (
              <option key={t.userId} value={t.userId}>{t.name}</option>
            ))}
          </select>
        )}
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="input w-40 py-1.5 text-sm">
          <option value="">Todas as origens</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {deals.length === 0 && (
        <div className="px-4 pt-4">
          <div className="card">
            <EmptyState
              title="Nenhuma negociação ainda"
              text="Cada conversa do WhatsApp e cada lead de formulário ou anúncio vira um card aqui automaticamente. Você também pode criar um lead manual."
              actionHref="/app/contatos"
              actionLabel="Criar lead manual"
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {stages.map((stage) => {
          const stageDeals = filtered.filter((d) => d.stageId === stage.id);
          const total = stageDeals.reduce((acc, d) => acc + Number(d.value ?? 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                if (dragging) void moveDeal(dragging, stage.id);
                setDragging(null);
              }}
              className={`flex h-full w-64 shrink-0 flex-col rounded-lg border ${
                overStage === stage.id ? "border-accent bg-accent-soft/30" : "border-line bg-gray-50/80"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      stage.kind === "won" ? "bg-ok" : stage.kind === "lost" ? "bg-danger" : "bg-accent"
                    }`}
                  />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <span className="text-xs text-muted">{stageDeals.length}</span>
                </div>
                {total > 0 && <span className="text-xs text-muted">{money(String(total))}</span>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {stageDeals.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`cursor-grab rounded-md border border-line bg-paper p-3 shadow-sm transition-opacity ${
                      dragging === d.id ? "opacity-50" : ""
                    }`}
                  >
                    <Link href={`/app/pipeline/negociacao/${d.id}`} className="block">
                      <div className="text-sm font-medium hover:text-accent">{d.contactName ?? d.title}</div>
                    </Link>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>{money(d.value) || "sem valor"}</span>
                      <span>{daysIn(d.stageEnteredAt)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {d.source && <span className="badge bg-gray-100 text-gray-600">{d.source}</span>}
                      {d.ownerName ? (
                        <span className="badge bg-accent-soft text-accent">{d.ownerName.split(" ")[0]}</span>
                      ) : (
                        <span className="badge bg-warn/10 text-warn">sem dono</span>
                      )}
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
                    Arraste negociações para cá
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
