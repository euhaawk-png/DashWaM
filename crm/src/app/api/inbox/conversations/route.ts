import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/db";
import { apiTenantCtx } from "@/lib/auth/guard";
import { listConversations, type ConversationFilter } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const filterParam = req.nextUrl.searchParams.get("filter") ?? "mine";
  const filter: ConversationFilter = ["mine", "unassigned", "all", "unread"].includes(filterParam)
    ? (filterParam as ConversationFilter)
    : "mine";
  const rows = await withTenant(ctx.tenant.id, (tx) => listConversations(tx, ctx, filter), {
    userId: ctx.user.id,
  });
  return NextResponse.json({ conversations: rows, role: ctx.role, userId: ctx.user.id });
}
