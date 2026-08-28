import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { contacts, deals, formSubmissions, messages, conversations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { apiTenantCtx } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** LGPD data export: everything the tenant holds about one contact (owner only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await apiTenantCtx();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { contactId } = await params;

  const data = await withTenant(
    ctx.tenant.id,
    async (tx) => {
      const contact = (
        await tx
          .select()
          .from(contacts)
          .where(and(eq(contacts.tenantId, ctx.tenant.id), eq(contacts.id, contactId)))
          .limit(1)
      )[0];
      if (!contact) return null;
      const conv = (
        await tx.select().from(conversations).where(eq(conversations.contactId, contactId)).limit(1)
      )[0];
      const result = {
        contact,
        deals: await tx.select().from(deals).where(eq(deals.contactId, contactId)),
        formSubmissions: await tx.select().from(formSubmissions).where(eq(formSubmissions.contactId, contactId)),
        messages: conv
          ? await tx.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt)
          : [],
      };
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "contact_export_lgpd",
        entity: "contact",
        entityId: contactId,
      });
      return result;
    },
    { userId: ctx.user.id }
  );
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="contato-${contactId}.json"`,
    },
  });
}
