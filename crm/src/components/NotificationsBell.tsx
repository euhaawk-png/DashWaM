"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsBell({ collapsed }: { collapsed: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.notifications);
      setUnread(json.unread);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void load();
    const es = new EventSource("/api/realtime");
    es.addEventListener("notify", () => void load());
    return () => es.close();
  }, [load]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/notifications", { method: "POST" });
      setUnread(0);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-ink"
        title="Notificações"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && "Notificações"}
        {unread > 0 && (
          <span className="absolute left-6 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-full z-20 mb-2 ml-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-line bg-paper shadow-lg">
          {items.length === 0 && <p className="p-4 text-sm text-muted">Nenhuma notificação.</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "#"}
              onClick={() => setOpen(false)}
              className={`block border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-gray-50 ${
                n.readAt ? "" : "bg-accent-soft/30"
              }`}
            >
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted">{n.body}</div>}
              <div className="mt-0.5 text-[11px] text-muted">
                {new Date(n.createdAt).toLocaleString("pt-BR")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
