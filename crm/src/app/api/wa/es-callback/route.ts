import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "@/db";
import { publicEndpoints, whatsappAccounts } from "@/db/schema";
import { apiTenantCtx, hasRole, sameOrigin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  fetchPhoneNumberInfo,
  registerPhoneNumber,
  subscribeAppToWaba,
} from "@/lib/whatsapp/client";

/**
 * Finishes Embedded Signup v4: the client posts the auth code + ids captured
 * from the Meta popup; we exchange the code for a business token, subscribe
 * our app to the WABA webhooks and register the phone for Cloud API.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ctx = await apiTenantCtx();
  if (!ctx || !hasRole(ctx, "owner")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = z
    .object({
      code: z.string().min(1),
      wabaId: z.string().min(1),
      phoneNumberId: z.string().min(1),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const { code, wabaId, phoneNumberId } = parsed.data;

  try {
    const token = await exchangeCodeForToken(code);
    await subscribeAppToWaba(wabaId, token);
    await registerPhoneNumber(phoneNumberId, token);
    const info = await fetchPhoneNumberInfo(phoneNumberId, token);

    await withTenant(ctx.tenant.id, async (tx) => {
      const existing = (
        await tx
          .select()
          .from(whatsappAccounts)
          .where(and(eq(whatsappAccounts.tenantId, ctx.tenant.id), eq(whatsappAccounts.phoneNumberId, phoneNumberId)))
          .limit(1)
      )[0];
      const values = {
        wabaId,
        accessTokenEnc: encryptSecret(token),
        displayPhone: info.display_phone_number ?? null,
        verifiedName: info.verified_name ?? null,
        qualityRating: info.quality_rating ?? null,
        messagingLimit: info.messaging_limit_tier ?? null,
        status: "connected" as const,
        connectedAt: new Date(),
      };
      if (existing) {
        await tx.update(whatsappAccounts).set(values).where(eq(whatsappAccounts.id, existing.id));
      } else {
        await tx.insert(whatsappAccounts).values({ tenantId: ctx.tenant.id, phoneNumberId, ...values });
      }
      await audit(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "whatsapp_connected",
        data: { phoneNumberId, wabaId },
      });
    });

    // Global routing indexes for webhook → tenant resolution.
    await db
      .insert(publicEndpoints)
      .values([
        { kind: "wa_phone", key: phoneNumberId, tenantId: ctx.tenant.id },
        { kind: "waba", key: wabaId, tenantId: ctx.tenant.id },
      ])
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, displayPhone: info.display_phone_number ?? null });
  } catch (err) {
    console.error("[es-callback] failed", err);
    return NextResponse.json(
      { error: "Não foi possível concluir a conexão com a Meta. Tente novamente." },
      { status: 502 }
    );
  }
}
