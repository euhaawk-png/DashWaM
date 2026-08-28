import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * DB-backed fixed-window rate limiter (works across serverless instances).
 * Returns true when the request is ALLOWED.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `)) as unknown as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0) <= limit;
}

/**
 * Progressive lockout for login-style endpoints: window doubles as strikes
 * accumulate. `strike()` after failures; `blocked()` before processing.
 */
export async function loginBlocked(key: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT count, window_start FROM rate_limits WHERE key = ${"lock:" + key}
  `)) as unknown as Array<{ count: number; window_start: Date }>;
  const row = rows[0];
  if (!row) return false;
  const strikes = Number(row.count);
  if (strikes < 5) return false;
  const lockMinutes = Math.min(60, 2 ** (strikes - 5)); // 1, 2, 4, ... capped at 60
  const until = new Date(row.window_start).getTime() + lockMinutes * 60_000;
  return Date.now() < until;
}

export async function loginStrike(key: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${"lock:" + key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - interval '1 hour' THEN 1 ELSE rate_limits.count + 1 END,
      window_start = now()
  `);
}

export async function loginClear(key: string): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE key = ${"lock:" + key}`);
}

export function ipFrom(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
