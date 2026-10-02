import { activityLog } from "@/db/schema";
import type { Tx } from "@/db";

type AuditInput = {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  data?: Record<string, unknown>;
  ip?: string | null;
};

/** Appends to the immutable audit trail. Must run inside a tenant context. */
export async function audit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(activityLog).values({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    data: input.data ?? {},
    ip: input.ip ?? null,
  });
}
