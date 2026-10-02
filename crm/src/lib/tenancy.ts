import { db, withTenant } from "@/db";
import { leadRoutingRules, memberships, pipelines, stages, tenants, type Role } from "@/db/schema";

export const DEFAULT_STAGES: Array<{ name: string; kind: "open" | "won" | "lost" }> = [
  { name: "Novo lead", kind: "open" },
  { name: "Em atendimento", kind: "open" },
  { name: "Proposta", kind: "open" },
  { name: "Ganhou", kind: "won" },
  { name: "Perdeu", kind: "lost" },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Creates a tenant with the default pipeline, stages and routing rule. */
export async function provisionTenant(name: string, slug: string): Promise<string> {
  const [tenant] = await db.insert(tenants).values({ name, slug }).returning();
  await withTenant(tenant.id, async (tx) => {
    const [pipeline] = await tx
      .insert(pipelines)
      .values({ tenantId: tenant.id, name: "Funil de vendas", isDefault: true })
      .returning();
    await tx.insert(stages).values(
      DEFAULT_STAGES.map((s, i) => ({
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        name: s.name,
        kind: s.kind,
        position: i,
      }))
    );
    await tx.insert(leadRoutingRules).values({
      tenantId: tenant.id,
      source: null,
      mode: "round_robin",
    });
  });
  return tenant.id;
}

export async function addMembership(tenantId: string, userId: string, role: Role): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.insert(memberships).values({ tenantId, userId, role });
  });
}
