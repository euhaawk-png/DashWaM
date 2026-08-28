import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __crmSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 10, prepare: false });
}

export type Db = PostgresJsDatabase<typeof schema>;

let _db: Db | undefined;

/** Lazy singleton: no connection (or env requirement) at build time. */
function realDb(): Db {
  if (!_db) {
    // Reuse the connection pool across hot reloads / serverless invocations.
    const client = globalThis.__crmSql ?? createClient();
    if (process.env.NODE_ENV !== "production") globalThis.__crmSql = client;
    _db = drizzle(client, { schema });
  }
  return _db;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const value = realDb()[prop as keyof Db];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(realDb()) : value;
  },
});
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a transaction with the tenant RLS context set. This is the
 * ONLY sanctioned way to touch tenant tables — outside of it, RLS returns
 * zero rows and rejects every write.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  opts?: { userId?: string }
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    if (opts?.userId) {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${opts.userId}, true)`);
    }
    return fn(tx);
  });
}

/**
 * Context for pre-tenant auth flows: only unlocks the member_self_read policy
 * on memberships (tenant picker after login). No other tenant data is visible.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Platform-admin context: unlocks ONLY the whatsapp_accounts metadata read
 * policy. Conversations/messages/contacts remain invisible by design.
 */
export async function withPlatformAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.platform_admin', 'on', true)`);
    return fn(tx);
  });
}
