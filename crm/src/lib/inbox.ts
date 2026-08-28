import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { contacts, conversations, deals, memberships, messages, users } from "@/db/schema";
import type { TenantCtx } from "@/lib/auth/guard";

export type ConversationFilter = "mine" | "unassigned" | "all" | "unread";

export function isManager(ctx: Pick<TenantCtx, "role">): boolean {
  return ctx.role === "manager" || ctx.role === "owner";
}

/** Sellers only ever see conversations assigned to them — enforced here. */
export function conversationAccessWhere(ctx: TenantCtx, filter: ConversationFilter) {
  const base = eq(conversations.tenantId, ctx.tenant.id);
  if (!isManager(ctx)) {
    const mine = and(base, eq(conversations.assignedTo, ctx.user.id));
    return filter === "unread" ? and(mine, gt(conversations.unreadCount, 0)) : mine;
  }
  switch (filter) {
    case "mine":
      return and(base, eq(conversations.assignedTo, ctx.user.id));
    case "unassigned":
      return and(base, isNull(conversations.assignedTo));
    case "unread":
      return and(base, gt(conversations.unreadCount, 0));
    default:
      return base;
  }
}

export async function listConversations(tx: Tx, ctx: TenantCtx, filter: ConversationFilter, limit = 50) {
  return tx
    .select({
      id: conversations.id,
      status: conversations.status,
      assignedTo: conversations.assignedTo,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      lastInboundAt: conversations.lastInboundAt,
      unreadCount: conversations.unreadCount,
      contactId: contacts.id,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactPic: contacts.profilePicUrl,
      assigneeName: users.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .leftJoin(users, eq(users.id, conversations.assignedTo))
    .where(conversationAccessWhere(ctx, filter))
    .orderBy(desc(sql`COALESCE(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(limit);
}

export async function getAccessibleConversation(tx: Tx, ctx: TenantCtx, conversationId: string) {
  const row = (
    await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, ctx.tenant.id), eq(conversations.id, conversationId)))
      .limit(1)
  )[0];
  if (!row) return null;
  if (!isManager(ctx) && row.assignedTo !== ctx.user.id) return null;
  return row;
}

export async function conversationDetail(tx: Tx, ctx: TenantCtx, conversationId: string) {
  const conversation = await getAccessibleConversation(tx, ctx, conversationId);
  if (!conversation) return null;
  const contact = (
    await tx.select().from(contacts).where(eq(contacts.id, conversation.contactId)).limit(1)
  )[0];
  const msgs = await tx
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(500);
  const deal = (
    await tx
      .select()
      .from(deals)
      .where(and(eq(deals.contactId, conversation.contactId), isNull(deals.wonAt), isNull(deals.lostAt)))
      .orderBy(desc(deals.createdAt))
      .limit(1)
  )[0];
  return { conversation, contact, messages: msgs, deal: deal ?? null };
}

/** 24h customer-service window: open while the last inbound is < 24h old. */
export function windowState(lastInboundAt: Date | string | null): { open: boolean; expiresAt: string | null } {
  if (!lastInboundAt) return { open: false, expiresAt: null };
  const expires = new Date(new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000);
  return { open: expires.getTime() > Date.now(), expiresAt: expires.toISOString() };
}

export async function listTeam(tx: Tx, tenantId: string) {
  return tx
    .select({ userId: memberships.userId, role: memberships.role, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active")));
}
