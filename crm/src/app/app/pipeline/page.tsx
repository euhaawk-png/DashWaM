import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { contacts, deals, pipelines, stages, users } from "@/db/schema";
import { requireTenant } from "@/lib/auth/guard";
import { isManager, listTeam } from "@/lib/inbox";
import { KanbanClient } from "./KanbanClient";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const ctx = await requireTenant();
  const manager = isManager(ctx);

  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const pipeline =
        (
          await tx
            .select()
            .from(pipelines)
            .where(and(eq(pipelines.tenantId, ctx.tenant.id), eq(pipelines.isDefault, true)))
            .limit(1)
        )[0] ?? (await tx.select().from(pipelines).where(eq(pipelines.tenantId, ctx.tenant.id)).limit(1))[0];
      if (!pipeline) return null;
      const stageRows = await tx.select().from(stages).where(eq(stages.pipelineId, pipeline.id));
      const where = manager
        ? and(eq(deals.tenantId, ctx.tenant.id), eq(deals.pipelineId, pipeline.id))
        : and(
            eq(deals.tenantId, ctx.tenant.id),
            eq(deals.pipelineId, pipeline.id),
            eq(deals.ownerId, ctx.user.id)
          );
      const dealRows = await tx
        .select({
          id: deals.id,
          title: deals.title,
          value: deals.value,
          stageId: deals.stageId,
          ownerId: deals.ownerId,
          source: deals.source,
          stageEnteredAt: deals.stageEnteredAt,
          createdAt: deals.createdAt,
          wonAt: deals.wonAt,
          lostAt: deals.lostAt,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          conversationId: deals.conversationId,
          ownerName: users.name,
        })
        .from(deals)
        .innerJoin(contacts, eq(contacts.id, deals.contactId))
        .leftJoin(users, eq(users.id, deals.ownerId))
        .where(where)
        .orderBy(desc(deals.createdAt))
        .limit(500);
      const team = manager ? await listTeam(tx, ctx.tenant.id) : [];
      return { pipeline, stages: stageRows, deals: dealRows, team };
    },
    { userId: ctx.user.id }
  );

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Nenhum funil configurado ainda.
      </div>
    );
  }

  return (
    <KanbanClient
      stages={data.stages
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
      deals={data.deals.map((d) => ({
        ...d,
        value: d.value,
        stageEnteredAt: d.stageEnteredAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
        wonAt: d.wonAt?.toISOString() ?? null,
        lostAt: d.lostAt?.toISOString() ?? null,
      }))}
      team={data.team.map((t) => ({ userId: t.userId, name: t.name }))}
      isManager={manager}
    />
  );
}
