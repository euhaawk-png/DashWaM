import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";

export const SESSION_COOKIE = "crm_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days, sliding

export type SessionRow = typeof sessions.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export async function createSession(
  userId: string,
  opts: { ip?: string | null; userAgent?: string | null; totpPending?: boolean; activeTenantId?: string | null }
): Promise<string> {
  const token = randomToken(32);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256Hex(token),
    totpPending: opts.totpPending ?? false,
    activeTenantId: opts.activeTenantId ?? null,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent?.slice(0, 400) ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Loads the current session + user; extends expiry (sliding window). */
export async function getSession(): Promise<{ session: SessionRow; user: UserRow } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = sha256Hex(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Slide the expiry at most once per hour to avoid a write per request.
  if (Date.now() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.session.id));
  }
  return row;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Used on password change: every session of the user is invalidated. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function setActiveTenant(sessionId: string, tenantId: string | null): Promise<void> {
  await db.update(sessions).set({ activeTenantId: tenantId }).where(eq(sessions.id, sessionId));
}

export async function completeTotp(sessionId: string): Promise<void> {
  await db.update(sessions).set({ totpPending: false }).where(eq(sessions.id, sessionId));
}

export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
}
