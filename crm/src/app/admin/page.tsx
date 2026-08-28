import { desc, eq } from "drizzle-orm";
import { db, withPlatformAdmin } from "@/db";
import { tenants, whatsappAccounts } from "@/db/schema";
import { brand } from "@/config/brand";
import { requirePlatformAdmin } from "@/lib/auth/guard";
import { logoutAction } from "../(auth)/actions";
import { setTenantStatusAction } from "./actions";
import { CreateTenantForm } from "./CreateTenantForm";

export const metadata = { title: "Admin da plataforma" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const allTenants = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  // Platform admin sees connection METADATA only (no conversation content).
  const waAccounts = await withPlatformAdmin((tx) =>
    tx
      .select({
        tenantId: whatsappAccounts.tenantId,
        status: whatsappAccounts.status,
        displayPhone: whatsappAccounts.displayPhone,
        qualityRating: whatsappAccounts.qualityRating,
        lastWebhookAt: whatsappAccounts.lastWebhookAt,
      })
      .from(whatsappAccounts)
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{brand.productName} · Admin da plataforma</h1>
          <p className="text-sm text-muted">Gestão operacional de tenants. Sem acesso ao conteúdo das conversas.</p>
        </div>
        <form action={logoutAction}>
          <button className="btn-secondary" type="submit">Sair</button>
        </form>
      </div>

      <div className="card mb-8 p-5">
        <h2 className="mb-3 font-semibold">Nova empresa</h2>
        <CreateTenantForm />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-gray-50 text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Último webhook</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {allTenants.map((t) => {
              const wa = waAccounts.find((w) => w.tenantId === t.id);
              return (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted">{t.slug} · plano {t.plan}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${t.status === "active" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
                      {t.status === "active" ? "Ativa" : "Suspensa"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {wa ? (
                      <span className={`badge ${wa.status === "connected" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
                        {wa.displayPhone ?? "conectado"} {wa.qualityRating ? `· ${wa.qualityRating}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">não conectado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {wa?.lastWebhookAt ? new Date(wa.lastWebhookAt).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={setTenantStatusAction}>
                      <input type="hidden" name="tenantId" value={t.id} />
                      <input type="hidden" name="status" value={t.status === "active" ? "suspended" : "active"} />
                      <button type="submit" className={t.status === "active" ? "btn-danger" : "btn-secondary"}>
                        {t.status === "active" ? "Suspender" : "Reativar"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {allTenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                  Nenhuma empresa criada ainda. Crie a primeira acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
