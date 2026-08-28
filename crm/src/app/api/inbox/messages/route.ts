import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { conversations } from "@/db/schema";
import { apiTenantCtx } from "@/lib/auth/guard";
import { conversationDetail, listTeam, windowState, isManager } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "missing conversationId" }, { status: 400 });

  const detail = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const d = await conversationDetail(tx, ctx, conversationId);
      if (d && d.conversation.unreadCount > 0) {
        await tx.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conversationId));
      }
      const team = isManager(ctx) ? await listTeam(tx, ctx.tenant.id) : [];
      return d ? { ...d, team } : null;
    },
    { userId: ctx.user.id }
  );
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ...detail,
    window: windowState(detail.conversation.lastInboundAt),
    role: ctx.role,
    userId: ctx.user.id,
  });
}
