import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe: app up + database reachable. */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: true, ts: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
