import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { messages, whatsappAccounts } from "@/db/schema";
import { apiTenantCtx } from "@/lib/auth/guard";
import { getAccessibleConversation } from "@/lib/inbox";
import { downloadMedia } from "@/lib/whatsapp/client";

export const dynamic = "force-dynamic";

/**
 * Tenant-scoped media proxy: streams WhatsApp media (Meta's CDN URLs expire
 * and require the account token). Access requires the session to reach the
 * message's conversation — media ids are never guessable public paths.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const ctx = await apiTenantCtx();
  if (!ctx) return new NextResponse("unauthorized", { status: 401 });
  const { mediaId } = await params;

  const allowed = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const msg = (
        await tx
          .select()
          .from(messages)
          .where(and(eq(messages.tenantId, ctx.tenant.id), eq(messages.mediaId, mediaId)))
          .limit(1)
      )[0];
      if (!msg) return null;
      const conversation = await getAccessibleConversation(tx, ctx, msg.conversationId);
      if (!conversation) return null;
      const account = (
        await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.tenantId, ctx.tenant.id)).limit(1)
      )[0];
      return account ?? null;
    },
    { userId: ctx.user.id }
  );
  if (!allowed) return new NextResponse("not found", { status: 404 });

  try {
    const upstream = await downloadMedia(allowed, mediaId);
    if (!upstream.ok || !upstream.body) return new NextResponse("media unavailable", { status: 502 });
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("media unavailable", { status: 502 });
  }
}
