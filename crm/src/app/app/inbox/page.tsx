import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { whatsappAccounts } from "@/db/schema";
import { requireTenant } from "@/lib/auth/guard";
import { InboxClient } from "./InboxClient";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await requireTenant();
  const { c } = await searchParams;
  const isManager = ctx.role === "manager" || ctx.role === "owner";
  const waAccount = await withTenant(
    ctx.tenant.id,
    (tx) =>
      tx
        .select({ status: whatsappAccounts.status })
        .from(whatsappAccounts)
        .where(eq(whatsappAccounts.tenantId, ctx.tenant.id))
        .limit(1)
        .then((r) => r[0]),
    { userId: ctx.user.id }
  );
  return (
    <InboxClient
      isManager={isManager}
      isOwner={ctx.role === "owner"}
      waConnected={waAccount?.status === "connected"}
      userId={ctx.user.id}
      initialConversationId={c ?? null}
    />
  );
}
