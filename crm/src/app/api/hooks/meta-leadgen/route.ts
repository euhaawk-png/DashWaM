import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { jobs, publicEndpoints, webhookEvents } from "@/db/schema";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";

export const dynamic = "force-dynamic";

/**
 * Meta Lead Ads (leadgen) webhook — stage 1 of 2. Meta only delivers the ids
 * (leadgen_id/page_id/form_id/ad_id); the actual lead data requires a Graph
 * API call with leads_retrieval, done asynchronously by the job worker with
 * retries, so a downtime here never loses the notification.
 * Behind the META_LEADGEN_ENABLED feature flag.
 */
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

type LeadgenBody = {
  object?: string;
  entry?: Array<{
    id: string; // page id
    changes?: Array<{
      field: string;
      value: { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; created_time?: number };
    }>;
  }>;
};

export async function POST(req: NextRequest) {
  if (process.env.META_LEADGEN_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true });
  }
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body: LeadgenBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value.leadgen_id) continue;
      const pageId = change.value.page_id ?? entry.id;
      const endpoint = (
        await db
          .select()
          .from(publicEndpoints)
          .where(and(eq(publicEndpoints.kind, "meta_page"), eq(publicEndpoints.key, pageId)))
          .limit(1)
      )[0];
      if (!endpoint) continue;

      await withTenant(endpoint.tenantId, async (tx) => {
        // Stage 1 logged separately from the later data fetch.
        const [event] = await tx
          .insert(webhookEvents)
          .values({
            tenantId: endpoint.tenantId,
            source: "meta_leadgen",
            payload: change.value as Record<string, unknown>,
            status: "received",
          })
          .returning();
        await tx.insert(jobs).values({
          tenantId: endpoint.tenantId,
          type: "fetch_leadgen",
          payload: {
            leadgenId: change.value.leadgen_id,
            pageId,
            webhookEventId: event.id,
          },
        });
      });
    }
  }
  return NextResponse.json({ ok: true });
}
