import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { memberships, tenants, type Role } from "@/db/schema";
import { getSession, type SessionRow, type UserRow } from "./session";

export type TenantCtx = {
  user: UserRow;
  session: SessionRow;
  tenant: typeof tenants.$inferSelect;
  role: Role;
  membershipId: string;
};

/** Requires an authenticated (and 2FA-complete) user, else redirects to login. */
export async function requireUser(): Promise<{ user: UserRow; session: SessionRow }> {
  const auth = await getSession();
  if (!auth) redirect("/login");
  if (auth.session.totpPending) redirect("/login/2fa");
  return auth;
}

/**
 * Requires an authenticated user with an active tenant selected, an active
 * membership in it, and the tenant itself not suspended.
 */
export async function requireTenant(): Promise<TenantCtx> {
  const { user, session } = await requireUser();
  if (!session.activeTenantId) redirect("/selecionar-empresa");
  const tenantId = session.activeTenantId;

  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const tenant = tenantRows[0];
  if (!tenant || tenant.status !== "active") redirect("/selecionar-empresa");

  const membership = await withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
        .limit(1)
        .then((r) => r[0]),
    { userId: user.id }
  );
  if (!membership) redirect("/selecionar-empresa");

  return { user, session, tenant, role: membership.role, membershipId: membership.id };
}

const ROLE_ORDER: Record<Role, number> = { seller: 0, manager: 1, owner: 2 };

export function hasRole(ctx: { role: Role }, min: Role): boolean {
  return ROLE_ORDER[ctx.role] >= ROLE_ORDER[min];
}

/** Server-side role gate — throws (500→ generic) instead of leaking details. */
export function assertRole(ctx: { role: Role }, min: Role): void {
  if (!hasRole(ctx, min)) throw new Error("FORBIDDEN");
}

export async function requireRole(min: Role): Promise<TenantCtx> {
  const ctx = await requireTenant();
  if (!hasRole(ctx, min)) redirect("/app/inbox");
  return ctx;
}

export async function requirePlatformAdmin(): Promise<{ user: UserRow; session: SessionRow }> {
  const auth = await getSession();
  if (!auth) redirect("/login");
  if (auth.session.totpPending) redirect("/login/2fa");
  if (!auth.user.isPlatformAdmin) redirect("/login");
  return auth;
}

/** API-route variants: return null instead of redirecting. */
export async function apiTenantCtx(): Promise<TenantCtx | null> {
  const auth = await getSession();
  if (!auth || auth.session.totpPending || !auth.session.activeTenantId) return null;
  const tenantId = auth.session.activeTenantId;
  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const tenant = tenantRows[0];
  if (!tenant || tenant.status !== "active") return null;
  const membership = await withTenant(
    tenantId,
    (tx) =>
      tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, auth.user.id), eq(memberships.status, "active")))
        .limit(1)
        .then((r) => r[0]),
    { userId: auth.user.id }
  );
  if (!membership) return null;
  return { user: auth.user, session: auth.session, tenant, role: membership.role, membershipId: membership.id };
}

/** Basic same-origin check for state-changing API routes (CSRF defense). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (no cookie-based CSRF risk without origin)
  const appUrl = process.env.APP_URL;
  try {
    return appUrl ? new URL(origin).origin === new URL(appUrl).origin : true;
  } catch {
    return false;
  }
}
