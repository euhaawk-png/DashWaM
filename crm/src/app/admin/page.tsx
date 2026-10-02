import { desc, eq } from "drizzle-orm";
import { db, withPlatformAdmin } from "@/db";
import { tenants, waUsageMonthly, whatsappAccounts } from "@/db/schema";
import { brand } from "@/config/brand";
import { requirePlatformAdmin } from "@/lib/auth/guard";
import { currentUsageMonth, FREE_SERVICE_MESSAGES_PER_MONTH, getServiceMsgPriceBrl } from "@/lib/wa-usage";
import { logoutAction } from "../(auth)/actions";
import { setServiceMsgPriceAction, setTenantStatusAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { CreateTenantForm } from "./CreateTenantForm";

export const metadata = { title: "Admin da plataforma" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const allTenants = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  // Platform admin sees connection METADATA only (no conversation content).
  const { waAccounts, usageRows } = await withPlatformAdmin(async (tx) => ({
    waAccounts: await tx
      .select({
        tenantId: whatsappAccounts.tenantId,
        status: whatsappAccounts.status,
        displayPhone: whatsappAccounts.displayPhone,
        qualityRating: whatsappAccounts.qualityRating,
        lastWebhookAt: whatsappAccounts.lastWebhookAt,
      })
      .from(whatsappAccounts),
    usageRows: await tx
      .select({
        tenantId: waUsageMonthly.tenantId,
        sent: waUsageMonthly.serviceMessagesSent,
      })
      .from(waUsageMonthly)
      .where(eq(waUsageMonthly.month, currentUsageMonth())),
  }));
  const unitPrice = await getServiceMsgPriceBrl();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">{brand.productName} · Admin da plataforma</h1>
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

      <div className="card mb-8 p-5">
        <h2 className="mb-1 font-semibold">Consumo de mensagens (Meta)</h2>
        <p className="mb-3 text-sm text-muted">
          Franquia: {FREE_SERVICE_MESSAGES_PER_MONTH.toLocaleString("pt-BR")} mensagens de serviço grátis por
          número/mês (regra de 01/10/2026). Estimativa local — a cobrança oficial é da Meta na conta de cada
          cliente.
        </p>
        <ActionForm
          action={setServiceMsgPriceAction}
          submitLabel="Salvar preço"
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="label text-xs" htmlFor="price">Preço unitário acima da franquia (R$/msg entregue)</label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.001"
              min="0"
              defaultValue={unitPrice}
              className="input w-40"
            />
          </div>
        </ActionForm>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-gray-50 text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Consumo no mês</th>
              <th className="px-4 py-3">Último webhook</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {allTenants.map((t) => {
              const wa = waAccounts.find((w) => w.tenantId === t.id);
              const used = usageRows
                .filter((u) => u.tenantId === t.id)
                .reduce((acc, u) => acc + u.sent, 0);
              const usagePct = Math.round((used / FREE_SERVICE_MESSAGES_PER_MONTH) * 100);
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
                  <td className="px-4 py-3">
                    {wa ? (
                      <span
                        className={`badge ${
                          usagePct >= 100 ? "bg-danger/10 text-danger" : usagePct >= 80 ? "bg-warn/10 text-warn" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {used.toLocaleString("pt-BR")} msgs ({usagePct}%)
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
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
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
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
