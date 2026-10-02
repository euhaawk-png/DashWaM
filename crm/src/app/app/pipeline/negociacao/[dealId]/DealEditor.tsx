"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Deal = {
  id: string;
  title: string;
  value: string | null;
  product: string | null;
  source: string | null;
  stageId: string;
  ownerId: string | null;
  lostReason: string | null;
  custom: Record<string, unknown>;
  wonAt: string | null;
  lostAt: string | null;
};

export function DealEditor({
  deal,
  stages,
  team,
  isManager,
}: {
  deal: Deal;
  stages: Array<{ id: string; name: string; kind: string }>;
  team: Array<{ userId: string; name: string }>;
  isManager: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError("Não foi possível salvar.");
    router.refresh();
  };

  const open = !deal.wonAt && !deal.lostAt;

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-muted">Negociação</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <label className="label text-xs">Título</label>
        <input className="input py-1.5 text-sm" defaultValue={deal.title} onBlur={(e) => e.target.value !== deal.title && patch({ title: e.target.value })} />
      </div>
      <div>
        <label className="label text-xs">Etapa</label>
        <select className="input py-1.5 text-sm" value={deal.stageId} onChange={(e) => patch({ stageId: e.target.value })}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input py-1.5 text-sm"
            defaultValue={deal.value ?? ""}
            onBlur={(e) => patch({ value: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label text-xs">Produto / serviço</label>
          <input className="input py-1.5 text-sm" defaultValue={deal.product ?? ""} onBlur={(e) => patch({ product: e.target.value || null })} />
        </div>
      </div>
      <div>
        <label className="label text-xs">Origem / canal</label>
        <input className="input py-1.5 text-sm" defaultValue={deal.source ?? ""} onBlur={(e) => patch({ source: e.target.value || null })} />
      </div>
      {isManager && (
        <div>
          <label className="label text-xs">Responsável</label>
          <select className="input py-1.5 text-sm" value={deal.ownerId ?? ""} onChange={(e) => patch({ ownerId: e.target.value || null })}>
            <option value="">Sem responsável</option>
            {team.map((t) => (
              <option key={t.userId} value={t.userId}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      {deal.lostAt && deal.lostReason && (
        <p className="text-sm text-danger">Motivo da perda: {deal.lostReason}</p>
      )}
      {open ? (
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-secondary flex-1 text-ok" onClick={() => patch({ outcome: "won" })}>
            Marcar ganho
          </button>
          <button
            type="button"
            className="btn-secondary flex-1 text-danger"
            onClick={() => {
              const reason = window.prompt("Motivo da perda:");
              if (reason !== null) void patch({ outcome: "lost", lostReason: reason || null });
            }}
          >
            Marcar perda
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            const target = stages.find((s) => s.kind === "open");
            if (target) void patch({ stageId: target.id });
          }}
        >
          Reabrir negociação
        </button>
      )}
    </div>
  );
}
