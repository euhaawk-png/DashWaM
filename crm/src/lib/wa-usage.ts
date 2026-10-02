import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { platformSettings, waUsageMonthly } from "@/db/schema";

export const FREE_SERVICE_MESSAGES_PER_MONTH = 1000;
const WABA_TIMEZONE = "America/Sao_Paulo"; // v1 default: BR product; counter resets on the 1st in this tz

/** Current billing month key ('YYYY-MM-01') in the WABA timezone. */
export function currentUsageMonth(date = new Date()): string {
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: WABA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return `${ym}-01`;
}

/**
 * Local consumption proxy: counts SERVICE messages SENT by this tenant/number
 * (free text + utility templates inside the window — both billed by Meta since
 * 2026-10-01). Official billing is Meta's, on delivered messages; this counter
 * is an estimate for the quota bar. Runs inside the tenant context.
 */
export async function incrementWaUsage(tx: Tx, tenantId: string, phoneNumberId: string, count = 1): Promise<void> {
  const month = currentUsageMonth();
  await tx.execute(sql`
    INSERT INTO wa_usage_monthly (tenant_id, phone_number_id, month, service_messages_sent)
    VALUES (${tenantId}, ${phoneNumberId}, ${month}, ${count})
    ON CONFLICT (tenant_id, phone_number_id, month)
    DO UPDATE SET service_messages_sent = wa_usage_monthly.service_messages_sent + ${count}, updated_at = now()
  `);
}

export async function getMonthUsage(tx: Tx, tenantId: string, phoneNumberId: string): Promise<number> {
  const row = (
    await tx
      .select({ sent: waUsageMonthly.serviceMessagesSent })
      .from(waUsageMonthly)
      .where(
        and(
          eq(waUsageMonthly.tenantId, tenantId),
          eq(waUsageMonthly.phoneNumberId, phoneNumberId),
          eq(waUsageMonthly.month, currentUsageMonth())
        )
      )
      .limit(1)
  )[0];
  return row?.sent ?? 0;
}

/** Unit price (BRL) per service message beyond the free tier: platform setting
 *  (super admin) → env META_SERVICE_MSG_BRL → 0.035 default. */
export async function getServiceMsgPriceBrl(): Promise<number> {
  const row = (
    await db.select().from(platformSettings).where(eq(platformSettings.key, "META_SERVICE_MSG_BRL")).limit(1)
  )[0];
  const fromDb = row ? Number(row.value) : NaN;
  if (Number.isFinite(fromDb) && fromDb >= 0) return fromDb;
  const fromEnv = Number(process.env.META_SERVICE_MSG_BRL);
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : 0.035;
}
