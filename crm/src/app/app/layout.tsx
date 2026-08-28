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
    ...(isManager ? [{ href: "/app/formularios", label: "Formulários", icon: "form" }] : []),
    ...(ctx.role === "owner" ? [{ href: "/app/integracoes", label: "Integrações", icon: "plug" }] : []),
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
      <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50/60">
        {ctx.role === "owner" && !ctx.tenant.settings.onboardingDone && (
          <a
            href="/app/onboarding"
            className="block shrink-0 bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent/90"
          >
            Complete a configuração da sua conta — conecte o WhatsApp e convide o time →
          </a>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
