import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { getSession } from "@/lib/auth/session";
import { listMyTenants, logoutAction, selectTenantAction } from "../(auth)/actions";

export const metadata = { title: "Selecionar empresa" };

const ROLE_LABEL: Record<string, string> = { owner: "Dono", manager: "Gerente", seller: "Vendedor" };

export default async function SelectTenantPage() {
  const auth = await getSession();
  if (!auth) redirect("/login");
  if (auth.session.totpPending) redirect("/login/2fa");
  const myTenants = await listMyTenants(auth.user.id);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <div className="text-2xl font-extrabold tracking-tight">{brand.productName}</div>
      </div>
      <div className="card w-full max-w-sm p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Selecionar empresa</h1>
        <p className="mb-4 text-sm text-muted">Olá, {auth.user.name}. Em qual empresa você quer trabalhar?</p>
        {myTenants.length === 0 ? (
          <p className="text-sm text-muted">
            Você ainda não faz parte de nenhuma empresa. Peça um convite ao administrador.
          </p>
        ) : (
          <div className="space-y-2">
            {myTenants.map((t) => (
              <form key={t.id} action={selectTenantAction}>
                <input type="hidden" name="tenantId" value={t.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-md border border-line px-4 py-3 text-left text-sm hover:border-accent hover:bg-accent-soft/40"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted">{ROLE_LABEL[t.role]}</span>
                </button>
              </form>
            ))}
          </div>
        )}
        <form action={logoutAction} className="mt-6 text-center">
          <button type="submit" className="text-sm text-muted hover:text-ink hover:underline">Sair</button>
        </form>
      </div>
    </div>
  );
}
