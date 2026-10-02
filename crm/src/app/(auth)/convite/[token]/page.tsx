import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, tenants } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Aceitar convite" };

const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  manager: "Gerente",
  seller: "Vendedor",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = (
    await db
      .select({ invite: invitations, tenant: tenants })
      .from(invitations)
      .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
      .where(
        and(
          eq(invitations.tokenHash, sha256Hex(token)),
          gt(invitations.expiresAt, new Date()),
          isNull(invitations.acceptedAt)
        )
      )
      .limit(1)
  )[0];

  if (!invite) {
    return (
      <div>
        <h1 className="mb-2 text-lg font-semibold">Convite inválido</h1>
        <p className="text-sm text-muted">
          Este convite expirou ou já foi utilizado. Peça um novo convite ao administrador da empresa.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Você foi convidado</h1>
      <p className="mb-4 text-sm text-muted">
        Entrar em <strong>{invite.tenant.name}</strong> como{" "}
        <strong>{ROLE_LABEL[invite.invite.role] ?? invite.invite.role}</strong> com o e-mail{" "}
        <strong>{invite.invite.email}</strong>. Defina sua senha para começar.
      </p>
      <InviteForm token={token} />
    </div>
  );
}
