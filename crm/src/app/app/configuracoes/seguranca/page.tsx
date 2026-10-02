import { requireTenant } from "@/lib/auth/guard";
import { ActionForm } from "@/components/ActionForm";
import { changePasswordAction, confirmTotpAction, disableTotpAction } from "../actions";
import { TotpSetup } from "./TotpSetup";

export const metadata = { title: "Minha segurança" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const ctx = await requireTenant();
  const has2fa = Boolean(ctx.user.totpSecretEnc);
  const require2fa = ctx.tenant.settings.require2fa && (ctx.role === "owner" || ctx.role === "manager");

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-4 font-semibold">Alterar senha</h2>
        <ActionForm action={changePasswordAction} submitLabel="Alterar senha">
          <div>
            <label className="label" htmlFor="current">Senha atual</label>
            <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Nova senha</label>
            <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
            <p className="mt-1 text-xs text-muted">Ao alterar a senha, todas as outras sessões são encerradas.</p>
          </div>
        </ActionForm>
      </div>

      <div className="card max-w-xl p-5">
        <h2 className="mb-1 font-semibold">Verificação em duas etapas (2FA)</h2>
        {require2fa && !has2fa && (
          <p className="mb-3 rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">
            Sua empresa exige 2FA para o seu papel. Ative abaixo.
          </p>
        )}
        {has2fa ? (
          <div>
            <p className="mb-4 text-sm text-ok">2FA ativado nesta conta. ✓</p>
            <ActionForm action={disableTotpAction} submitLabel="Desativar 2FA">
              <div>
                <label className="label" htmlFor="dpassword">Confirme sua senha</label>
                <input id="dpassword" name="password" type="password" required className="input w-64" />
              </div>
            </ActionForm>
          </div>
        ) : (
          <TotpSetup confirmAction={confirmTotpAction} />
        )}
      </div>
    </div>
  );
}
