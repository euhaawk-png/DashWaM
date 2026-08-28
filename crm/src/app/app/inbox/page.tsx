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
  return <InboxClient isManager={isManager} userId={ctx.user.id} initialConversationId={c ?? null} />;
}
