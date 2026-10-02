import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { leadRoutingRules, memberships } from "@/db/schema";

/**
 * Resolves the seller a new lead/conversation should be assigned to, following
 * the tenant's routing rules: rule for the exact source, else the default
 * (source = null) rule. Returns null for the "unassigned queue" mode.
 * Round-robin walks active sellers ordered by membership creation.
 */
export async function pickAssignee(tx: Tx, tenantId: string, source: string | null): Promise<string | null> {
  const rules = await tx
    .select()
    .from(leadRoutingRules)
    .where(and(eq(leadRoutingRules.tenantId, tenantId), eq(leadRoutingRules.active, true)));
  const rule = rules.find((r) => r.source === source) ?? rules.find((r) => r.source === null);
  if (!rule) return null;
  if (rule.mode === "unassigned") return null;
  if (rule.mode === "fixed") return rule.fixedUserId ?? null;

  // round_robin
  const sellers = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active"), eq(memberships.role, "seller"))
    )
    .orderBy(asc(memberships.createdAt));
  if (sellers.length === 0) return null;

  const lastIdx = sellers.findIndex((s) => s.userId === rule.lastAssignedUserId);
  const next = sellers[(lastIdx + 1) % sellers.length].userId;
  await tx
    .update(leadRoutingRules)
    .set({ lastAssignedUserId: next })
    .where(eq(leadRoutingRules.id, rule.id));
  return next;
}
