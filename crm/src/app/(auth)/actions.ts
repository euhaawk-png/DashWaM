"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant, withUser } from "@/db";
import { invitations, memberships, passwordResetTokens, tenants, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decryptSecret } from "@/lib/crypto";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { emailLayout, sendEmail } from "@/lib/email";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { loginBlocked, loginClear, loginStrike, rateLimit } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import {
  clearSessionCookie,
  completeTotp,
  createSession,
  destroyAllSessions,
  destroyCurrentSession,
  getSession,
  setActiveTenant,
  setSessionCookie,
} from "@/lib/auth/session";

export type ActionState = { error?: string; ok?: boolean };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };
  const email = parsed.data.email.toLowerCase().trim();
  const ip = await clientIp();

  if (!(await rateLimit(`login:ip:${ip}`, 30, 300))) {
    return { error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  if ((await loginBlocked(`login:${email}`)) || (await loginBlocked(`login-ip:${ip}`))) {
    return { error: "Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde." };
  }

  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    await loginStrike(`login:${email}`);
    await loginStrike(`login-ip:${ip}`);
    return { error: GENERIC_LOGIN_ERROR };
  }
  await loginClear(`login:${email}`);

  const h = await headers();
  const needsTotp = Boolean(user.totpSecretEnc);
  const token = await createSession(user.id, {
    ip,
    userAgent: h.get("user-agent"),
    totpPending: needsTotp,
  });
  await setSessionCookie(token);
  if (needsTotp) redirect("/login/2fa");
  await postLoginRedirect(user.id, user.isPlatformAdmin);
  return { ok: true };
}

/** Picks the landing page after auth: single tenant → straight to inbox. */
async function postLoginRedirect(userId: string, isPlatformAdmin: boolean): Promise<never> {
  const mships = await withUser(userId, (tx) =>
    tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
  );
  if (mships.length === 1) {
    const auth = await getSession();
    if (auth) {
      await setActiveTenant(auth.session.id, mships[0].tenantId);
      await withTenant(mships[0].tenantId, (tx) =>
        audit(tx, { tenantId: mships[0].tenantId, userId, action: "login" })
      );
    }
    redirect("/app/inbox");
  }
  if (mships.length === 0 && isPlatformAdmin) redirect("/admin");
  redirect("/selecionar-empresa");
}

export async function verifyTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await getSession();
  if (!auth) redirect("/login");
  if (!auth.session.totpPending) redirect("/app/inbox");
  const code = String(formData.get("code") ?? "");
  if (!(await rateLimit(`totp:${auth.user.id}`, 10, 300))) {
    return { error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const secret = auth.user.totpSecretEnc ? decryptSecret(auth.user.totpSecretEnc) : null;
  if (!secret || !verifyTotp(secret, code)) {
    return { error: "Código inválido. Tente novamente." };
  }
  await completeTotp(auth.session.id);
  await postLoginRedirect(auth.user.id, auth.user.isPlatformAdmin);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function selectTenantAction(formData: FormData): Promise<void> {
  const auth = await getSession();
  if (!auth || auth.session.totpPending) redirect("/login");
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));
  const mship = await withUser(auth.user.id, (tx) =>
    tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, auth.user.id),
          eq(memberships.tenantId, tenantId),
          eq(memberships.status, "active")
        )
      )
      .limit(1)
      .then((r) => r[0])
  );
  if (!mship) redirect("/selecionar-empresa");
  await setActiveTenant(auth.session.id, tenantId);
  await withTenant(tenantId, (tx) => audit(tx, { tenantId, userId: auth.user.id, action: "login" }));
  redirect("/app/inbox");
}

const GENERIC_RESET_MESSAGE =
  "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.";

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string().email().max(200) }).safeParse({ email: formData.get("email") });
  const ip = await clientIp();
  if (!(await rateLimit(`forgot:ip:${ip}`, 5, 900))) {
    return { error: "Muitas tentativas. Aguarde alguns minutos." };
  }
  if (!parsed.success) return { ok: true, error: GENERIC_RESET_MESSAGE };
  const email = parsed.data.email.toLowerCase().trim();
  if (!(await rateLimit(`forgot:email:${email}`, 3, 900))) return { ok: true, error: GENERIC_RESET_MESSAGE };

  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (user) {
    const token = randomToken(32);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });
    const url = `${process.env.APP_URL}/redefinir-senha?token=${token}`;
    await sendEmail(
      email,
      "Redefinição de senha",
      emailLayout(
        "Redefinir sua senha",
        `<p>Clique no link abaixo para criar uma nova senha. O link expira em 30 minutos.</p>
         <p><a href="${url}">Redefinir senha</a></p>`
      )
    );
  }
  return { ok: true, error: GENERIC_RESET_MESSAGE };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "As senhas não coincidem." };
  const weak = validatePasswordStrength(password);
  if (weak) return { error: weak };

  const row = (
    await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256Hex(token)),
          gt(passwordResetTokens.expiresAt, new Date()),
          isNull(passwordResetTokens.usedAt)
        )
      )
      .limit(1)
  )[0];
  if (!row) return { error: "Link inválido ou expirado. Solicite um novo." };

  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId));
  await destroyAllSessions(row.userId); // password change kills every session
  await clearSessionCookie();
  redirect("/login?reset=1");
}

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2) return { error: "Informe seu nome." };
  const weak = validatePasswordStrength(password);
  if (weak) return { error: weak };

  const invite = (
    await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, sha256Hex(token)),
          gt(invitations.expiresAt, new Date()),
          isNull(invitations.acceptedAt)
        )
      )
      .limit(1)
  )[0];
  if (!invite) return { error: "Convite inválido ou expirado. Peça um novo convite." };

  const email = invite.email.toLowerCase();
  let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email, name, passwordHash: await hashPassword(password) })
      .returning();
  }

  await withTenant(invite.tenantId, async (tx) => {
    const existing = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, invite.tenantId), eq(memberships.userId, user.id)))
      .limit(1);
    if (existing[0]) {
      await tx
        .update(memberships)
        .set({ role: invite.role as "owner" | "manager" | "seller", status: "active" })
        .where(eq(memberships.id, existing[0].id));
    } else {
      await tx.insert(memberships).values({
        tenantId: invite.tenantId,
        userId: user.id,
        role: invite.role as "owner" | "manager" | "seller",
      });
    }
    await audit(tx, {
      tenantId: invite.tenantId,
      userId: user.id,
      action: "invite_accepted",
      data: { role: invite.role },
    });
  });
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));

  const h = await headers();
  const sessionToken = await createSession(user.id, {
    ip: await clientIp(),
    userAgent: h.get("user-agent"),
    activeTenantId: invite.tenantId,
  });
  await setSessionCookie(sessionToken);
  redirect("/app/inbox");
}

export async function listMyTenants(userId: string) {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ tenantId: memberships.tenantId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
  );
  if (rows.length === 0) return [];
  const tenantRows = await db
    .select()
    .from(tenants)
    .where(inArray(tenants.id, rows.map((r) => r.tenantId)));
  return rows
    .map((m) => {
      const t = tenantRows.find((t) => t.id === m.tenantId);
      return t && t.status === "active" ? { id: t.id, name: t.name, role: m.role } : null;
    })
    .filter((x): x is { id: string; name: string; role: "owner" | "manager" | "seller" } => x !== null);
}
