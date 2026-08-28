import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { apiTenantCtx } from "@/lib/auth/guard";
import { isManager } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream. Emits a `refresh` event whenever the tenant's
 * message/conversation state changes (new message, delivery status, unread),
 * and `notify` when the user gains unread notifications. Clients refetch on
 * refresh — simple, stateless, works on any Postgres.
 */
export async function GET(req: NextRequest) {
  const ctx = await apiTenantCtx();
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let lastState = "";
      let lastNotif = -1;

      const tick = async () => {
        if (closed) return;
        try {
          const { state, notifCount } = await withTenant(
            ctx.tenant.id,
            async (tx) => {
              const scope = isManager(ctx) ? sql`` : sql`AND c.assigned_to = ${ctx.user.id}`;
              const rows = (await tx.execute(sql`
                SELECT
                  count(m.id)::bigint AS msg_count,
                  coalesce(max(m.created_at)::text, '') AS max_created,
                  coalesce(sum(CASE m.status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 WHEN 'failed' THEN 9 ELSE 0 END), 0)::bigint AS status_sum,
                  coalesce(sum(c.unread_count), 0)::bigint AS unread
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                WHERE c.tenant_id = ${ctx.tenant.id} ${scope}
              `)) as unknown as Array<Record<string, unknown>>;
              const n = (await tx.execute(sql`
                SELECT count(*)::bigint AS c FROM notifications
                WHERE tenant_id = ${ctx.tenant.id} AND user_id = ${ctx.user.id} AND read_at IS NULL
              `)) as unknown as Array<{ c: number }>;
              return { state: JSON.stringify(rows[0]), notifCount: Number(n[0]?.c ?? 0) };
            },
            { userId: ctx.user.id }
          );
          if (closed) return;
          if (state !== lastState) {
            lastState = state;
            controller.enqueue(encoder.encode(`event: refresh\ndata: {}\n\n`));
          }
          if (notifCount !== lastNotif) {
            lastNotif = notifCount;
            controller.enqueue(encoder.encode(`event: notify\ndata: ${JSON.stringify({ count: notifCount })}\n\n`));
          }
        } catch (err) {
          if (!closed) console.error("[realtime] poll error", err);
        }
      };

      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      void tick();
      timer = setInterval(tick, 2500);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  req.signal.addEventListener("abort", () => {
    closed = true;
    if (timer) clearInterval(timer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
