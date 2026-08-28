import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { contacts, conversations, notifications } from "@/db/schema";
import { audit } from "@/lib/audit";
import { apiTenantCtx, sameOrigin } from "@/lib/auth/guard";
import { getAccessibleConversation, isManager } from "@/lib/inbox";

const schema = z.object({
  conversationId: z.string().uuid(),
  action: z.enum(["assign", "close", "reopen", "unread"]),
  userId: z.string().uuid().nullable().optional(),
});

/** Conversation actions: assign/transfer (manager+), close, reopen, mark unread. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const { conversationId, action, userId } = parsed.data;

  const status = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const conversation = await getAccessibleConversation(tx, ctx, conversationId);
      if (!conversation) return 404;

      switch (action) {
        case "assign": {
          if (!isManager(ctx)) return 403;
          await tx
            .update(conversations)
            .set({ assignedTo: userId ?? null })
            .where(eq(conversations.id, conversationId));
          if (userId && userId !== ctx.user.id) {
            const contact = (
              await tx.select().from(contacts).where(eq(contacts.id, conversation.contactId)).limit(1)
            )[0];
            await tx.insert(notifications).values({
              tenantId: ctx.tenant.id,
              userId,
              type: "conversation_assigned",
              title: "Conversa transferida para você",
              body: contact?.name ?? contact?.phone ?? "Conversa",
              link: `/app/inbox?c=${conversationId}`,
            });
          }
          await audit(tx, {
            tenantId: ctx.tenant.id,
            userId: ctx.user.id,
            action: "conversation_assign",
            entity: "conversation",
            entityId: conversationId,
            data: { assignedTo: userId ?? null },
          });
          return 200;
        }
        case "close":
          await tx.update(conversations).set({ status: "closed" }).where(eq(conversations.id, conversationId));
          return 200;
        case "reopen":
          await tx.update(conversations).set({ status: "open" }).where(eq(conversations.id, conversationId));
          return 200;
        case "unread":
          await tx.update(conversations).set({ unreadCount: 1 }).where(eq(conversations.id, conversationId));
          return 200;
      }
    },
    { userId: ctx.user.id }
  );

  if (status !== 200) return NextResponse.json({ error: "denied" }, { status });
  return NextResponse.json({ ok: true });
}
