import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db";
import { formSubmissions } from "@/db/schema";
import { loadPublicForm } from "@/lib/forms-public";
import { ipFrom, rateLimit } from "@/lib/rate-limit";

/** Records the "Chamar no WhatsApp" click on the form success screen. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await rateLimit(`wa-click:${ipFrom(req)}`, 20, 300))) {
    return NextResponse.json({ ok: true });
  }
  const parsed = z
    .object({ submissionId: z.string().uuid() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const loaded = await loadPublicForm(slug);
  if (!loaded) return NextResponse.json({ ok: true });

  await withTenant(loaded.tenantId, (tx) =>
    tx
      .update(formSubmissions)
      .set({ waCtaClickedAt: new Date() })
      .where(
        and(
          eq(formSubmissions.id, parsed.data.submissionId),
          eq(formSubmissions.formId, loaded.form.id)
        )
      )
  );
  return NextResponse.json({ ok: true });
}
