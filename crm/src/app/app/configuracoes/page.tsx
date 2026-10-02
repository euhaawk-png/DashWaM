import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { updateCompanySettingsAction } from "./actions";

export const metadata = { title: "Configurações da empresa" };

export default async function CompanySettingsPage() {
  const ctx = await requireTenant();
  if (ctx.role !== "owner") redirect("/app/configuracoes/seguranca");
  const s = ctx.tenant.settings;

  return (
    <div className="card max-w-xl p-5">
      <h2 className="mb-4 font-semibold">Empresa</h2>
      <ActionForm action={updateCompanySettingsAction} submitLabel="Salvar">
        <div>
          <label className="label" htmlFor="name">Nome da empresa</label>
          <input id="name" name="name" defaultValue={ctx.tenant.name} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="welcomeMessage">Mensagem automática de boas-vindas (opcional)</label>
          <textarea
            id="welcomeMessage"
            name="welcomeMessage"
            rows={3}
            defaultValue={s.welcomeMessage ?? ""}
            placeholder="Ex.: Olá! Recebemos sua mensagem e um consultor vai te atender em instantes."
            className="input"
          />
          <p className="mt-1 text-xs text-muted">
            Enviada na primeira mensagem de um contato novo (dentro da janela de 24h). Deixe em branco para desativar.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="firstResponseAlertMinutes">Alerta de demora (minutos)</label>
          <input
            id="firstResponseAlertMinutes"
            name="firstResponseAlertMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={s.firstResponseAlertMinutes ?? 0}
            className="input w-32"
          />
          <p className="mt-1 text-xs text-muted">
            Se uma conversa nova ficar esse tempo sem primeira resposta, o gerente é notificado. 0 desativa.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="require2fa" defaultChecked={s.require2fa ?? false} />
          Exigir 2FA de donos e gerentes
        </label>
      </ActionForm>
    </div>
  );
}
