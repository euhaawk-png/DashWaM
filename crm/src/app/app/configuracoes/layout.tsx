import Link from "next/link";
import { requireTenant } from "@/lib/auth/guard";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const isOwner = ctx.role === "owner";
  const isManager = isOwner || ctx.role === "manager";

  const tabs = [
    ...(isOwner ? [{ href: "/app/configuracoes", label: "Empresa" }] : []),
    ...(isOwner ? [{ href: "/app/configuracoes/whatsapp", label: "WhatsApp" }] : []),
    ...(isOwner ? [{ href: "/app/configuracoes/equipe", label: "Equipe" }] : []),
    ...(isManager ? [{ href: "/app/configuracoes/respostas-rapidas", label: "Respostas rápidas" }] : []),
    ...(isManager ? [{ href: "/app/configuracoes/distribuicao", label: "Distribuição" }] : []),
    { href: "/app/configuracoes/seguranca", label: "Minha segurança" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-4 text-xl font-bold">Configurações</h1>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
