"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConversationListItem = {
  id: string;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  assigneeName: string | null;
};

type Message = {
  id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  status: string;
  isInternalNote: boolean;
  createdAt: string;
};

type Detail = {
  conversation: {
    id: string;
    status: string;
    assignedTo: string | null;
    lastInboundAt: string | null;
  };
  contact: { id: string; name: string | null; phone: string | null; email: string | null; source: string | null };
  messages: Message[];
  deal: {
    id: string;
    title: string;
    value: string | null;
    product: string | null;
    stageId: string;
    pipelineId: string;
    source: string | null;
    wonAt: string | null;
    lostAt: string | null;
  } | null;
  team: Array<{ userId: string; name: string; role: string }>;
  window: { open: boolean; expiresAt: string | null };
};

type Meta = {
  quickReplies: Array<{ id: string; shortcut: string; body: string }>;
  templates: Array<{ id: string; name: string; status: string; body: string; language: string }>;
  stages: Array<{ id: string; pipelineId: string; name: string; kind: string; position: number }>;
};

const EMOJIS = ["😀", "😉", "👍", "🙏", "🎉", "❤️", "😅", "🤝", "✅", "📞", "💰", "🚀"];

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function StatusTicks({ status }: { status: string }) {
  if (status === "failed") return <span title="Falhou" className="text-danger">!</span>;
  if (status === "read") return <span title="Lida" className="text-accent">✓✓</span>;
  if (status === "delivered") return <span title="Entregue">✓✓</span>;
  if (status === "sent") return <span title="Enviada">✓</span>;
  return null;
}

export function InboxClient({
  isManager,
  isOwner,
  waConnected,
  userId,
  initialConversationId,
}: {
  isManager: boolean;
  isOwner: boolean;
  waConnected: boolean;
  userId: string;
  initialConversationId: string | null;
}) {
  const [filter, setFilter] = useState(isManager ? "all" : "mine");
  const [list, setList] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [composer, setComposer] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const unreadTotal = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      audioCtx.current ??= new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      /* autoplay policies may block audio before interaction */
    }
  }, []);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/inbox/conversations?filter=${filter}`);
    if (!res.ok) return;
    const json = await res.json();
    const items: ConversationListItem[] = json.conversations;
    const total = items.reduce((acc, c) => acc + c.unreadCount, 0);
    if (total > unreadTotal.current) beep();
    unreadTotal.current = total;
    document.title = total > 0 ? `(${total}) Inbox` : "Inbox";
    setList(items);
  }, [filter, beep]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/inbox/messages?conversationId=${id}`);
    if (!res.ok) {
      setDetail(null);
      return;
    }
    setDetail(await res.json());
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    fetch("/api/inbox/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // Realtime: refetch on server-sent refresh events.
  useEffect(() => {
    const es = new EventSource("/api/realtime");
    const onRefresh = () => {
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    };
    es.addEventListener("refresh", onRefresh);
    return () => es.close();
  }, [loadList, loadDetail, selectedId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [detail?.messages.length]);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!selectedId) return;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/inbox/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: selectedId, ...payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Falha ao enviar.");
        setComposer("");
        setNoteMode(false);
        await loadDetail(selectedId);
        await loadList();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar.");
      } finally {
        setSending(false);
      }
    },
    [selectedId, loadDetail, loadList]
  );

  const doAction = useCallback(
    async (action: string, targetUserId?: string | null) => {
      if (!selectedId) return;
      await fetch("/api/inbox/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, action, userId: targetUserId }),
      });
      await loadDetail(selectedId);
      await loadList();
    },
    [selectedId, loadDetail, loadList]
  );

  const patchDeal = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!detail?.deal) return;
      await fetch(`/api/deals/${detail.deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (selectedId) await loadDetail(selectedId);
    },
    [detail?.deal, selectedId, loadDetail]
  );

  const dealStages = useMemo(
    () =>
      (meta?.stages ?? [])
        .filter((s) => s.pipelineId === detail?.deal?.pipelineId)
        .sort((a, b) => a.position - b.position),
    [meta?.stages, detail?.deal?.pipelineId]
  );
  const approvedTemplates = useMemo(
    () => (meta?.templates ?? []).filter((t) => t.status === "APPROVED"),
    [meta?.templates]
  );

  const windowOpen = detail?.window.open ?? false;
  const filters: Array<[string, string]> = isManager
    ? [["all", "Todas"], ["mine", "Minhas"], ["unassigned", "Não atribuídas"], ["unread", "Não lidas"]]
    : [["mine", "Minhas"], ["unread", "Não lidas"]];

  return (
    <div className="flex h-full">
      {/* Column 1 — conversation list */}
      <div className={`w-full shrink-0 flex-col border-r border-line bg-paper md:flex md:w-80 ${selectedId ? "hidden" : "flex"}`}>
        <div className="border-b border-line p-3">
          <h1 className="mb-2 text-base font-semibold">Inbox</h1>
          <div className="flex flex-wrap gap-1">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  filter === key ? "bg-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 &&
            (!waConnected ? (
              <div className="p-6 text-center text-sm">
                <div className="mb-2 text-2xl">💬</div>
                <p className="mb-1 font-semibold">Conecte seu WhatsApp para começar</p>
                <p className="mb-4 text-muted">
                  O inbox recebe as conversas do número oficial da empresa (API oficial da Meta, sem QR code).
                  Cada conversa vira um lead no funil automaticamente.
                </p>
                {isOwner ? (
                  <a href="/app/configuracoes/whatsapp" className="btn-primary inline-flex">
                    Conectar WhatsApp
                  </a>
                ) : (
                  <p className="text-xs text-muted">
                    Peça ao dono da conta para conectar em Configurações → WhatsApp.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted">
                Nenhuma conversa aqui ainda.
                <br />
                Quando um cliente mandar mensagem no WhatsApp da empresa, ela aparece nesta lista.
              </div>
            ))}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left hover:bg-gray-50 ${
                selectedId === c.id ? "bg-accent-soft/50" : ""
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
                {(c.contactName ?? c.contactPhone ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.contactName ?? c.contactPhone}</span>
                  <span className="shrink-0 text-xs text-muted">{fmtTime(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{c.lastMessagePreview ?? "—"}</span>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                  {c.status === "closed" && <span className="badge bg-gray-100 text-gray-500">Fechada</span>}
                  {c.assigneeName ? <span>{c.assigneeName}</span> : <span className="text-warn">Não atribuída</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Column 2 — thread */}
      <div className={`min-w-0 flex-1 flex-col md:flex ${selectedId ? "flex" : "hidden"}`}>
        {!detail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Selecione uma conversa para atender.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-2.5">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mr-2 rounded-md border border-line px-2 py-1 text-sm md:hidden"
                aria-label="Voltar para a lista"
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {detail.contact.name ?? detail.contact.phone}
                </div>
                <div className="text-xs text-muted">{detail.contact.phone}</div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${windowOpen ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}
                  title={
                    detail.window.expiresAt
                      ? `Janela de 24h até ${new Date(detail.window.expiresAt).toLocaleString("pt-BR")}`
                      : "Sem mensagem recebida do contato"
                  }
                >
                  {windowOpen ? "Janela aberta" : "Janela expirada"}
                </span>
                {isManager && (
                  <select
                    className="input w-40 py-1 text-xs"
                    value={detail.conversation.assignedTo ?? ""}
                    onChange={(e) => doAction("assign", e.target.value || null)}
                  >
                    <option value="">Não atribuída</option>
                    {detail.team.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="btn-secondary px-2.5 py-1 text-xs"
                  onClick={() => doAction("unread")}
                  title="Marcar como não lida"
                >
                  Não lida
                </button>
                <button
                  type="button"
                  className="btn-secondary px-2.5 py-1 text-xs"
                  onClick={() => doAction(detail.conversation.status === "closed" ? "reopen" : "close")}
                >
                  {detail.conversation.status === "closed" ? "Reabrir" : "Fechar"}
                </button>
              </div>
            </div>

            <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-gray-50/60 p-4">
              {detail.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      m.isInternalNote
                        ? "border border-warn/30 bg-warn/10"
                        : m.direction === "out"
                          ? "bg-accent-soft"
                          : "bg-paper border border-line"
                    }`}
                  >
                    {m.isInternalNote && (
                      <div className="mb-0.5 text-[11px] font-semibold uppercase text-warn">Nota interna</div>
                    )}
                    {m.mediaId && (
                      <div className="mb-1">
                        {m.type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/wa/media/${m.mediaId}`}
                            alt="Imagem recebida"
                            className="max-h-64 rounded-md"
                          />
                        ) : m.type === "audio" ? (
                          <audio controls src={`/api/wa/media/${m.mediaId}`} className="max-w-full" />
                        ) : (
                          <a
                            href={`/api/wa/media/${m.mediaId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                          >
                            📄 Abrir anexo
                          </a>
                        )}
                      </div>
                    )}
                    {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
                      {fmtTime(m.createdAt)}
                      {m.direction === "out" && !m.isInternalNote && <StatusTicks status={m.status} />}
                    </div>
                    {m.status === "failed" && (
                      <div className="text-[11px] text-danger">Falha no envio</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="border-t border-line bg-paper p-3">
              {!windowOpen && !noteMode && (
                <div className="mb-2 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
                  A janela de 24h expirou — só é possível enviar um <strong>template aprovado</strong>.
                  {approvedTemplates.length === 0 && " Nenhum template aprovado disponível (crie em Configurações)."}
                </div>
              )}
              {error && <p className="mb-2 text-xs text-danger">{error}</p>}
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  {showQuick && (
                    <div className="absolute bottom-full z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-md border border-line bg-paper shadow-md">
                      {(meta?.quickReplies ?? []).length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted">
                          Sem respostas rápidas. Crie em Configurações → Respostas rápidas.
                        </div>
                      )}
                      {(meta?.quickReplies ?? []).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                          onClick={() => {
                            setComposer(q.body);
                            setShowQuick(false);
                          }}
                        >
                          <span className="font-medium">/{q.shortcut}</span>{" "}
                          <span className="text-muted">{q.body.slice(0, 60)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showEmoji && (
                    <div className="absolute bottom-full z-10 mb-1 flex flex-wrap gap-1 rounded-md border border-line bg-paper p-2 shadow-md">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="rounded p-1 text-lg hover:bg-gray-100"
                          onClick={() => {
                            setComposer((c) => c + e);
                            setShowEmoji(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (composer.trim() && !sending && (windowOpen || noteMode)) {
                          void send(noteMode ? { note: composer.trim() } : { text: composer.trim() });
                        }
                      }
                    }}
                    rows={2}
                    placeholder={
                      noteMode
                        ? "Escreva uma nota interna (o cliente não recebe)…"
                        : "Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha)"
                    }
                    className={`input resize-none ${noteMode ? "border-warn/40 bg-warn/5" : ""}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      title="Emoji"
                      className="rounded-md border border-line px-2 py-1 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setShowEmoji((v) => !v);
                        setShowQuick(false);
                      }}
                    >
                      🙂
                    </button>
                    <button
                      type="button"
                      title="Respostas rápidas"
                      className="rounded-md border border-line px-2 py-1 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setShowQuick((v) => !v);
                        setShowEmoji(false);
                      }}
                    >
                      ⚡
                    </button>
                    <button
                      type="button"
                      title="Nota interna"
                      className={`rounded-md border px-2 py-1 text-sm ${
                        noteMode ? "border-warn bg-warn/10" : "border-line hover:bg-gray-50"
                      }`}
                      onClick={() => setNoteMode((v) => !v)}
                    >
                      📝
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={sending || !composer.trim() || (!windowOpen && !noteMode)}
                    className="btn-primary px-4 py-1.5"
                    onClick={() => send(noteMode ? { note: composer.trim() } : { text: composer.trim() })}
                  >
                    Enviar
                  </button>
                </div>
              </div>
              {!windowOpen && approvedTemplates.length > 0 && !noteMode && (
                <div className="mt-2 flex items-center gap-2">
                  <select id="tpl" className="input flex-1 py-1 text-xs" defaultValue="">
                    <option value="" disabled>
                      Escolher template aprovado…
                    </option>
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.body.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary py-1 text-xs"
                    disabled={sending}
                    onClick={() => {
                      const sel = document.getElementById("tpl") as HTMLSelectElement | null;
                      if (sel?.value) void send({ templateId: sel.value });
                    }}
                  >
                    Enviar template
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Column 3 — lead panel */}
      {detail && (
        <div className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-paper p-4 lg:flex">
          <h2 className="mb-3 text-sm font-semibold text-muted">Dados do lead</h2>
          <div className="mb-4 space-y-1 text-sm">
            <div className="font-medium">{detail.contact.name ?? "Sem nome"}</div>
            <div className="text-muted">{detail.contact.phone}</div>
            {detail.contact.email && <div className="text-muted">{detail.contact.email}</div>}
            {detail.contact.source && (
              <div>
                <span className="badge bg-gray-100 text-gray-600">Origem: {detail.contact.source}</span>
              </div>
            )}
          </div>

          {detail.deal ? (
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-muted">Negociação</h3>
              <div>
                <label className="label text-xs">Etapa</label>
                <select
                  className="input py-1.5 text-sm"
                  value={detail.deal.stageId}
                  onChange={(e) => patchDeal({ stageId: e.target.value })}
                >
                  {dealStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input py-1.5 text-sm"
                  defaultValue={detail.deal.value ?? ""}
                  onBlur={(e) =>
                    patchDeal({ value: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label text-xs">Produto / serviço</label>
                <input
                  className="input py-1.5 text-sm"
                  defaultValue={detail.deal.product ?? ""}
                  onBlur={(e) => patchDeal({ product: e.target.value || null })}
                />
              </div>
              {detail.deal.wonAt ? (
                <div className="badge bg-ok/10 text-ok">Ganha 🎉</div>
              ) : detail.deal.lostAt ? (
                <div className="badge bg-danger/10 text-danger">Perdida</div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1 text-ok" onClick={() => patchDeal({ outcome: "won" })}>
                    Ganhou
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1 text-danger"
                    onClick={() => {
                      const reason = window.prompt("Motivo da perda:");
                      if (reason !== null) void patchDeal({ outcome: "lost", lostReason: reason || null });
                    }}
                  >
                    Perdeu
                  </button>
                </div>
              )}
              <a href={`/app/pipeline/negociacao/${detail.deal.id}`} className="block text-center text-sm text-accent hover:underline">
                Ver negociação completa →
              </a>
            </div>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-muted">Sem negociação vinculada.</p>
          )}
        </div>
      )}
    </div>
  );
}
