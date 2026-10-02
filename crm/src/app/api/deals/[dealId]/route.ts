import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { dealEvents, deals, stages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { apiTenantCtx, sameOrigin } from "@/lib/auth/guard";
import { isManager } from "@/lib/inbox";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().min(0).max(999_999_999).nullable().optional(),
  product: z.string().max(200).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  stageId: z.string().uuid().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  outcome: z.enum(["won", "lost", "reopen"]).optional(),
  lostReason: z.string().max(300).nullable().optional(),
});

/** Inline deal updates from the inbox panel and the kanban. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { dealId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const input = parsed.data;

  const status = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const deal = (
        await tx
          .select()
          .from(deals)
          .where(and(eq(deals.tenantId, ctx.tenant.id), eq(deals.id, dealId)))
          .limit(1)
      )[0];
      if (!deal) return 404;
      // Sellers may only edit their own deals; reassignment is manager+.
      if (!isManager(ctx)) {
        if (deal.ownerId !== ctx.user.id) return 403;
        if (input.ownerId !== undefined) return 403;
      }

      const patch: Partial<typeof deals.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.value !== undefined) patch.value = input.value === null ? null : String(input.value);
      if (input.product !== undefined) patch.product = input.product;
      if (input.source !== undefined) patch.source = input.source;
      if (input.ownerId !== undefined) patch.ownerId = input.ownerId;

      if (input.stageId && input.stageId !== deal.stageId) {
        const stage = (
          await tx
            .select()
            .from(stages)
            .where(and(eq(stages.tenantId, ctx.tenant.id), eq(stages.id, input.stageId)))
            .limit(1)
        )[0];
        if (!stage || stage.pipelineId !== deal.pipelineId) return 400;
        patch.stageId = stage.id;
        patch.stageEnteredAt = new Date();
        if (stage.kind === "won") {
          patch.wonAt = new Date();
          patch.lostAt = null;
        } else if (stage.kind === "lost") {
          patch.lostAt = new Date();
          patch.wonAt = null;
          if (input.lostReason !== undefined) patch.lostReason = input.lostReason;
        } else {
          patch.wonAt = null;
          patch.lostAt = null;
          patch.lostReason = null;
        }
        await tx.insert(dealEvents).values({
          tenantId: ctx.tenant.id,
          dealId,
          type: stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "stage_change",
          data: { from: deal.stageId, to: stage.id, stageName: stage.name, lostReason: input.lostReason ?? null },
          userId: ctx.user.id,
        });
      }

      if (input.outcome === "won" || input.outcome === "lost") {
        // Move to the pipeline's won/lost stage.
        const target = (
          await tx
            .select()
            .from(stages)
            .where(
              and(
                eq(stages.tenantId, ctx.tenant.id),
                eq(stages.pipelineId, deal.pipelineId),
                eq(stages.kind, input.outcome)
              )
            )
            .limit(1)
        )[0];
        if (target) {
          patch.stageId = target.id;
          patch.stageEnteredAt = new Date();
        }
        if (input.outcome === "won") {
          patch.wonAt = new Date();
          patch.lostAt = null;
        } else {
          patch.lostAt = new Date();
          patch.wonAt = null;
          patch.lostReason = input.lostReason ?? deal.lostReason;
        }
        await tx.insert(dealEvents).values({
          tenantId: ctx.tenant.id,
          dealId,
          type: input.outcome,
          data: { value: input.value ?? deal.value, lostReason: input.lostReason ?? null },
          userId: ctx.user.id,
        });
      }

      if (Object.keys(patch).length > 0) {
        await tx.update(deals).set(patch).where(eq(deals.id, dealId));
      }
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "deal_update",
        entity: "deal",
        entityId: dealId,
        data: patch as Record<string, unknown>,
      });
      return 200;
    },
    { userId: ctx.user.id }
  );

  if (status !== 200) return NextResponse.json({ error: "denied" }, { status });
  return NextResponse.json({ ok: true });
}
