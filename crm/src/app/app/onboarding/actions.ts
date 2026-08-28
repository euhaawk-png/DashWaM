"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import { stages, tenants, type TenantSettings } from "@/db/schema";
import { requireRole } from "@/lib/auth/guard";

async function saveSettings(tenantId: string, patch: Partial<TenantSettings>): Promise<void> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  await db
    .update(tenants)
    .set({ settings: { ...tenant.settings, ...patch } })
    .where(eq(tenants.id, tenantId));
}

export async function onboardingStepAction(formData: FormData): Promise<void> {
  const ctx = await requireRole("owner");
  const step = z.coerce.number().int().min(0).max(6).parse(formData.get("step"));

  // Step-specific saves before advancing.
  const name = formData.get("companyName");
  if (typeof name === "string" && name.trim().length >= 2) {
    await db.update(tenants).set({ name: name.trim() }).where(eq(tenants.id, ctx.tenant.id));
  }
  const segment = formData.get("segment");
  const patch: Partial<TenantSettings> = { onboardingStep: step };
  if (typeof segment === "string" && segment.trim()) patch.segment = segment.trim();
  if (step >= 6) patch.onboardingDone = true;

  // Stage renames from step 4 (inputs named stage:<id>).
  const renames: Array<{ id: string; name: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("stage:") && typeof value === "string" && value.trim()) {
      renames.push({ id: key.slice(6), name: value.trim().slice(0, 60) });
    }
  }
  if (renames.length > 0) {
    await withTenant(
      ctx.tenant.id,
      async (tx) => {
        for (const r of renames) {
          if (z.string().uuid().safeParse(r.id).success) {
            await tx.update(stages).set({ name: r.name }).where(eq(stages.id, r.id));
          }
        }
      },
      { userId: ctx.user.id }
    );
  }

  await saveSettings(ctx.tenant.id, patch);
  revalidatePath("/app/onboarding");
  revalidatePath("/app", "layout");
}
