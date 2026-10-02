"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { brand } from "@/config/brand";
import { NotificationsBell } from "./NotificationsBell";

const ICONS: Record<string, React.ReactNode> = {
  inbox: (
    <path d="M3 12l2-7h14l2 7v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zm2.4 0H9a3 3 0 006 0h3.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  kanban: <path d="M5 4h4v16H5zM15 4h4v10h-4z" strokeLinecap="round" strokeLinejoin="round" />,
  users: (
    <path d="M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6zM19 19v-1a4 4 0 00-2.5-3.7M15.5 5.3a3 3 0 010 5.4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  form: <path d="M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm3 5h6M9 12h6M9 16h4" strokeLinecap="round" strokeLinejoin="round" />,
  plug: <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0V7zM12 16v5" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M4 20h17" strokeLinecap="round" strokeLinejoin="round" />,
  gear: (
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-2-1.2L14.6 3h-4l-.4 2.7a7.5 7.5 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 002 1.2l.4 2.7h4l.4-2.7a7.5 7.5 0 002-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

export function Sidebar({
  items,
  tenantName,
  userName,
  roleLabel,
  logoutAction,
}: {
  items: Array<{ href: string; label: string; icon: string }>;
  tenantName: string;
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full flex-col border-r border-line bg-paper transition-all ${collapsed ? "w-16" : "w-60"}`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {/* Brand manual: sidebar shows the symbol alone, no wordmark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brand.symbolUrl}
          alt={brand.productName}
          title={brand.productName}
          className={`h-6 w-auto ${collapsed ? "mx-auto" : ""}`}
        />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`rounded p-1 text-muted hover:bg-gray-100 hover:text-ink ${collapsed ? "hidden" : ""}`}
          aria-label="Recolher menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mx-auto mb-2 rounded p-1 text-muted hover:bg-gray-100 hover:text-ink"
          aria-label="Expandir menu"
          title="Expandir menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {!collapsed && (
        <div className="mx-4 mb-3 truncate rounded-md bg-gray-50 px-3 py-2 text-xs font-medium text-muted">
          {tenantName}
        </div>
      )}
      <nav className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-accent-soft text-accent" : "text-gray-600 hover:bg-gray-50 hover:text-ink"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
                {ICONS[item.icon]}
              </svg>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <div className="mb-1">
          <NotificationsBell collapsed={collapsed} />
        </div>
        {!collapsed && (
          <div className="mb-2 px-1">
            <div className="truncate text-sm font-medium">{userName}</div>
            <div className="text-xs text-muted">{roleLabel}</div>
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" className="w-full rounded-md px-3 py-1.5 text-left text-sm text-muted hover:bg-gray-50 hover:text-ink">
            {collapsed ? "⎋" : "Sair"}
          </button>
        </form>
      </div>
    </aside>
  );
}
