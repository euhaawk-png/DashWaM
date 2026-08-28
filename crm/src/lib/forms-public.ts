import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { forms, publicEndpoints } from "@/db/schema";

/** Resolves a public form by slug: global index → tenant-scoped load. */
export async function loadPublicForm(slug: string) {
  const endpoint = (
    await db
      .select()
      .from(publicEndpoints)
      .where(and(eq(publicEndpoints.kind, "form_slug"), eq(publicEndpoints.key, slug)))
      .limit(1)
  )[0];
  if (!endpoint) return null;
  const form = await withTenant(endpoint.tenantId, (tx) =>
    tx
      .select()
      .from(forms)
      .where(and(eq(forms.tenantId, endpoint.tenantId), eq(forms.slug, slug)))
      .limit(1)
      .then((r) => r[0])
  );
  if (!form || !form.active) return null;
  return { form, tenantId: endpoint.tenantId };
}
