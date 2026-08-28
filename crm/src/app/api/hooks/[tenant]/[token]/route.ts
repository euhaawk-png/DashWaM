import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { inboundWebhooks, jobs, tenants, webhookEvents } from "@/db/schema";
import { decryptSecret, safeEqual } from "@/lib/crypto";
import { createLeadFromHook, type GoogleLeadPayload } from "@/lib/hooks";
import { ipFrom, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function parseBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return (await req.json()) as Record<string, unknown>;
    }
    if (contentType.includes("form")) {
      const fd = await req.formData();
      const out: Record<string, unknown> = {};
      fd.forEach((v, k) => {
        out[k] = typeof v === "string" ? v : "[file]";
      });
      return out;
    }
    const text = await req.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/**
 * Per-tenant inbound webhook: /api/hooks/{tenantSlug}/{token}
 * - google_ads: key validated against payload.google_key
 * - wordpress/generic: key via X-Api-Key header or ?key= query param
 * Every POST is logged in webhook_events; invalid auth → 401 + "rejected" log.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string; token: string }> }) {
  const { tenant: tenantSlug, token } = await params;
  const ip = ipFrom(req);
  if (!(await rateLimit(`hook:${token}`, 120, 60)) || !(await rateLimit(`hook:ip:${ip}`, 300, 60))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const tenant = (await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1))[0];
  if (!tenant || tenant.status !== "active") return NextResponse.json({ error: "not found" }, { status: 404 });

  const payload = await parseBody(req);
  if (!payload) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const result = await withTenant(tenant.id, async (tx) => {
    const webhook = (
      await tx
        .select()
        .from(inboundWebhooks)
        .where(and(eq(inboundWebhooks.tenantId, tenant.id), eq(inboundWebhooks.token, token)))
        .limit(1)
    )[0];
    if (!webhook || !webhook.active) return { status: 404 as const };

    // Authentication per connector type.
    const secret = webhook.secretEnc ? decryptSecret(webhook.secretEnc) : null;
    let authorized = false;
    if (webhook.type === "google_ads") {
      const key = String((payload as GoogleLeadPayload & { google_key?: string }).google_key ?? "");
      authorized = Boolean(secret && key && safeEqual(key, secret));
    } else {
      const provided =
        req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("key") ?? "";
      authorized = Boolean(secret && provided && safeEqual(provided, secret));
    }

    const [event] = await tx
      .insert(webhookEvents)
      .values({
        tenantId: tenant.id,
        webhookId: webhook.id,
        source: webhook.type,
        payload,
        status: authorized ? "received" : "rejected",
        error: authorized ? null : "Chave de autenticação inválida",
      })
      .returning();
    if (!authorized) return { status: 401 as const };

    try {
      await createLeadFromHook(tx, tenant.id, webhook, payload);
      await tx
        .update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, event.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await tx
        .update(webhookEvents)
        .set({ status: "failed", error: message })
        .where(eq(webhookEvents.id, event.id));
      // Retry later — critical for lead capture.
      await tx.insert(jobs).values({
        tenantId: tenant.id,
        type: "reprocess_hook_event",
        payload: { webhookEventId: event.id },
        runAt: new Date(Date.now() + 120_000),
      });
    }
    return { status: 200 as const };
  });

  if (result.status === 404) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Google's test button expects a plain 200 quickly.
  return NextResponse.json({ ok: true });
}
