import { db } from "@/db";
import { invitations, type Role } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { emailLayout, sendEmail } from "@/lib/email";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvitation(input: {
  tenantId: string;
  tenantName: string;
  email: string;
  role: Role;
  invitedBy?: string;
}): Promise<string> {
  const token = randomToken(32);
  await db.insert(invitations).values({
    tenantId: input.tenantId,
    email: input.email.toLowerCase().trim(),
    role: input.role,
    tokenHash: sha256Hex(token),
    invitedBy: input.invitedBy ?? null,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const url = `${process.env.APP_URL}/convite/${token}`;
  await sendEmail(
    input.email,
    `Convite para ${input.tenantName}`,
    emailLayout(
      `Você foi convidado para ${input.tenantName}`,
      `<p>Você foi convidado a acessar o CRM de <strong>${input.tenantName}</strong>.</p>
       <p><a href="${url}">Aceitar convite e criar minha senha</a></p>
       <p style="color:#6B7280;font-size:13px">O convite expira em 7 dias.</p>`
    )
  );
  return url;
}
