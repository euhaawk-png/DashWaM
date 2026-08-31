import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runDueJobs, runMaintenance } from "@/lib/jobs-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Background worker endpoint. Accepts both the Vercel cron invocation and any
 * external scheduler (cron-job.org etc.) — both must send
 * `Authorization: Bearer <CRON_SECRET>`; anything else gets 401.
 * On Vercel Hobby the built-in cron runs only daily (vercel.json), so point an
 * external scheduler here every minute for near-real-time jobs (see README).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDueJobs(20);
  // Light maintenance roughly every ~10th run to keep the endpoint fast.
  if (Math.random() < 0.1) await runMaintenance();
  return NextResponse.json(result);
}
