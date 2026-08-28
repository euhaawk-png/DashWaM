import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { jobs, publicEndpoints, webhookEvents } from "@/db/schema";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import {
  processInboundMessages,
  processStatuses,
  processTemplateUpdate,
  type WaWebhookValue,
} from "@/lib/whatsapp/inbound";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake (GET). */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN &&
    params.get("hub.verify_token")
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id: string; // WABA id
    changes?: Array<{ field: string; value: WaWebhookValue }>;
  }>;
};

async function tenantIdFor(kind: string, key: string): Promise<string | null> {
  const row = (
    await db
      .select()
      .from(publicEndpoints)
      .where(and(eq(publicEndpoints.kind, kind), eq(publicEndpoints.key, key)))
      .limit(1)
  )[0];
  return row?.tenantId ?? null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    console.warn("[wa-webhook] invalid signature rejected");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      try {
        if (change.field === "messages") {
          const phoneNumberId = change.value.metadata?.phone_number_id;
          if (!phoneNumberId) continue;
          const tenantId = await tenantIdFor("wa_phone", phoneNumberId);
          if (!tenantId) {
            console.warn("[wa-webhook] no tenant for phone_number_id");
            continue;
          }
          await withTenant(tenantId, async (tx) => {
            const [event] = await tx
              .insert(webhookEvents)
              .values({ tenantId, source: "whatsapp", payload: change.value as Record<string, unknown> })
              .returning();
            try {
              await processInboundMessages(tx, tenantId, change.value);
              await processStatuses(tx, tenantId, change.value);
              await tx
                .update(webhookEvents)
                .set({ status: "processed", processedAt: new Date() })
                .where(eq(webhookEvents.id, event.id));
            } catch (err) {
              await tx
                .update(webhookEvents)
                .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
                .where(eq(webhookEvents.id, event.id));
              // Retry asynchronously so Meta still gets a 200.
              await tx.insert(jobs).values({
                tenantId,
                type: "reprocess_wa_event",
                payload: { webhookEventId: event.id },
                runAt: new Date(Date.now() + 60_000),
              });
            }
          });
        } else if (change.field === "message_template_status_update") {
          const tenantId = await tenantIdFor("waba", entry.id);
          if (!tenantId) continue;
          await withTenant(tenantId, (tx) => processTemplateUpdate(tx, tenantId, change.value));
        }
      } catch (err) {
        // Never fail the whole webhook batch — Meta would retry everything.
        console.error("[wa-webhook] change processing error", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
