import { requireTenant } from "@/lib/auth/guard";
import { logoutAction } from "../(auth)/actions";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const isManager = ctx.role === "manager" || ctx.role === "owner";

  const items = [
    { href: "/app/inbox", label: "Inbox", icon: "inbox" },
    { href: "/app/pipeline", label: "Pipeline", icon: "kanban" },
    { href: "/app/contatos", label: "Contatos", icon: "users" },
    ...(isManager
      ? [
          { href: "/app/formularios", label: "Formulários", icon: "form" },
          { href: "/app/integracoes", label: "Integrações", icon: "plug" },
        ]
      : []),
    { href: "/app/relatorios", label: "Relatórios", icon: "chart" },
    { href: "/app/configuracoes", label: "Configurações", icon: "gear" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={items}
        tenantName={ctx.tenant.name}
        userName={ctx.user.name}
        roleLabel={{ owner: "Dono", manager: "Gerente", seller: "Vendedor" }[ctx.role]}
        logoutAction={logoutAction}
      />
      <main className="flex-1 overflow-y-auto bg-gray-50/60">{children}</main>
    </div>
  );
}
