import { requireRole } from "@/lib/auth/guard";
import { withTenant } from "@/db";
import { ActionForm } from "@/components/ActionForm";
import { inviteUserAction, updateMemberAction } from "../actions";
import { and, eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";

export const metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { owner: "Dono", manager: "Gerente", seller: "Vendedor" };

export default async function TeamPage() {
  const ctx = await requireRole("owner");
  const members = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          status: memberships.status,
          name: users.name,
          email: users.email,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenant.id))),
    { userId: ctx.user.id }
  );

  return (
    <div className="space-y-6">
      <div className="card max-w-xl p-5">
        <h2 className="mb-4 font-semibold">Convidar usuário</h2>
        <ActionForm action={inviteUserAction} submitLabel="Enviar convite" className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">Papel</label>
            <select id="role" name="role" className="input" defaultValue="seller">
              <option value="seller">Vendedor</option>
              <option value="manager">Gerente</option>
              <option value="owner">Dono</option>
            </select>
          </div>
        </ActionForm>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-gray-50 text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted">{m.email}</div>
                </td>
                <td className="px-4 py-3">
                  {m.userId === ctx.user.id ? (
                    <span>{ROLE_LABEL[m.role]}</span>
                  ) : (
                    <form action={updateMemberAction}>
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="input w-32 py-1 text-xs"
                      >
                        <option value="seller">Vendedor</option>
                        <option value="manager">Gerente</option>
                        <option value="owner">Dono</option>
                      </select>{" "}
                      <button type="submit" className="text-xs text-accent hover:underline">Salvar</button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${m.status === "active" ? "bg-ok/10 text-ok" : "bg-gray-100 text-gray-500"}`}>
                    {m.status === "active" ? "Ativo" : "Desativado"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {m.userId !== ctx.user.id && (
                    <form action={updateMemberAction}>
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <input type="hidden" name="status" value={m.status === "active" ? "disabled" : "active"} />
                      <button type="submit" className={m.status === "active" ? "btn-danger text-xs" : "btn-secondary text-xs"}>
                        {m.status === "active" ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
