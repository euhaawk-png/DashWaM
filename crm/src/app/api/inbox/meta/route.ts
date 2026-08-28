import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { quickReplies, stages, waTemplates } from "@/db/schema";
import { apiTenantCtx } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** Composer/panel metadata: quick replies, approved templates, stages. */
export async function GET() {
  const ctx = await apiTenantCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => ({
      quickReplies: await tx.select().from(quickReplies).where(eq(quickReplies.tenantId, ctx.tenant.id)),
      templates: await tx.select().from(waTemplates).where(eq(waTemplates.tenantId, ctx.tenant.id)),
      stages: await tx.select().from(stages).where(eq(stages.tenantId, ctx.tenant.id)),
    }),
    { userId: ctx.user.id }
  );
  return NextResponse.json(data);
}
