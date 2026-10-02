import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { notifications } from "@/db/schema";
import { apiTenantCtx, sameOrigin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.tenantId, ctx.tenant.id), eq(notifications.userId, ctx.user.id)))
        .orderBy(desc(notifications.createdAt))
        .limit(20),
    { userId: ctx.user.id }
  );
  return NextResponse.json({
    notifications: rows,
    unread: rows.filter((n) => !n.readAt).length,
  });
}

/** Marks all of the user's notifications as read. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.tenantId, ctx.tenant.id),
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.readAt)
          )
        ),
    { userId: ctx.user.id }
  );
  return NextResponse.json({ ok: true });
}
