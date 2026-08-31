import { sql } from "drizzle-orm";
import type { Tx } from "@/db";

export type Period = { from: Date; to: Date };

export type FirstResponseRow = {
  user_id: string | null;
  user_name: string | null;
  conversations: number;
  avg_minutes: number | null;
  median_minutes: number | null;
};

/** Report 1 — first response time per seller (median + average, minutes). */
export async function firstResponseReport(tx: Tx, tenantId: string, p: Period, onlyUserId?: string) {
  return (await tx.execute(sql`
    SELECT c.assigned_to AS user_id, u.name AS user_name,
           count(*)::int AS conversations,
           round(avg(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60)::numeric, 1)::float AS avg_minutes,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60))::numeric, 1)::float AS median_minutes
    FROM conversations c
    LEFT JOIN users u ON u.id = c.assigned_to
    WHERE c.tenant_id = ${tenantId}
      AND c.first_response_at IS NOT NULL
      AND c.created_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()}
      ${onlyUserId ? sql`AND c.assigned_to = ${onlyUserId}` : sql``}
    GROUP BY c.assigned_to, u.name
    ORDER BY median_minutes NULLS LAST
  `)) as unknown as FirstResponseRow[];
}

export type SourceRow = { source: string | null; leads: number; won: number; total_value: number };

/** Report 2 — leads per channel/source. */
export async function leadsBySourceReport(tx: Tx, tenantId: string, p: Period, onlyUserId?: string) {
  return (await tx.execute(sql`
    SELECT coalesce(d.source, 'sem origem') AS source,
           count(*)::int AS leads,
           count(*) FILTER (WHERE d.won_at IS NOT NULL)::int AS won,
           coalesce(sum(d.value) FILTER (WHERE d.won_at IS NOT NULL), 0)::float AS total_value
    FROM deals d
    WHERE d.tenant_id = ${tenantId}
      AND d.created_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()}
      ${onlyUserId ? sql`AND d.owner_id = ${onlyUserId}` : sql``}
    GROUP BY d.source
    ORDER BY leads DESC
  `)) as unknown as SourceRow[];
}

export type FunnelRow = { stage_id: string; stage_name: string; kind: string; position: number; deals: number };
export type FunnelSummary = {
  won: number;
  lost: number;
  total_won_value: number;
  avg_ticket: number | null;
};
export type LostReasonRow = { reason: string; count: number };

/** Report 3 — funnel: per-stage volume, win/loss, revenue, loss reasons. */
export async function funnelReport(tx: Tx, tenantId: string, p: Period, onlyUserId?: string) {
  const scope = onlyUserId ? sql`AND d.owner_id = ${onlyUserId}` : sql``;
  const stages = (await tx.execute(sql`
    SELECT s.id AS stage_id, s.name AS stage_name, s.kind, s.position,
           count(d.id) FILTER (WHERE d.created_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()} ${scope})::int AS deals
    FROM stages s
    JOIN pipelines pl ON pl.id = s.pipeline_id AND pl.is_default = true
    LEFT JOIN deals d ON d.stage_id = s.id
    WHERE s.tenant_id = ${tenantId}
    GROUP BY s.id, s.name, s.kind, s.position
    ORDER BY s.position
  `)) as unknown as FunnelRow[];
  const [summary] = (await tx.execute(sql`
    SELECT count(*) FILTER (WHERE d.won_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::int AS won,
           count(*) FILTER (WHERE d.lost_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::int AS lost,
           coalesce(sum(d.value) FILTER (WHERE d.won_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()}), 0)::float AS total_won_value,
           round(avg(d.value) FILTER (WHERE d.won_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::numeric, 2)::float AS avg_ticket
    FROM deals d
    WHERE d.tenant_id = ${tenantId} ${scope}
  `)) as unknown as FunnelSummary[];
  const lostReasons = (await tx.execute(sql`
    SELECT coalesce(nullif(trim(d.lost_reason), ''), 'não informado') AS reason, count(*)::int AS count
    FROM deals d
    WHERE d.tenant_id = ${tenantId} AND d.lost_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()} ${scope}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `)) as unknown as LostReasonRow[];
  return { stages, summary, lostReasons };
}

export type ProductivityRow = {
  user_id: string;
  user_name: string;
  conversations_handled: number;
  messages_sent: number;
  deals_won: number;
  value_won: number;
};

/** Report 4 — productivity per seller. */
export async function productivityReport(tx: Tx, tenantId: string, p: Period, onlyUserId?: string) {
  return (await tx.execute(sql`
    SELECT u.id AS user_id, u.name AS user_name,
      (SELECT count(*) FROM conversations c
        WHERE c.tenant_id = ${tenantId} AND c.assigned_to = u.id
          AND c.first_response_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::int AS conversations_handled,
      (SELECT count(*) FROM messages m
        WHERE m.tenant_id = ${tenantId} AND m.author_id = u.id AND m.direction = 'out'
          AND m.is_internal_note = false AND m.created_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::int AS messages_sent,
      (SELECT count(*) FROM deals d
        WHERE d.tenant_id = ${tenantId} AND d.owner_id = u.id
          AND d.won_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::int AS deals_won,
      (SELECT coalesce(sum(d.value), 0) FROM deals d
        WHERE d.tenant_id = ${tenantId} AND d.owner_id = u.id
          AND d.won_at BETWEEN ${p.from.toISOString()} AND ${p.to.toISOString()})::float AS value_won
    FROM memberships ms
    JOIN users u ON u.id = ms.user_id
    WHERE ms.tenant_id = ${tenantId} AND ms.status = 'active'
      ${onlyUserId ? sql`AND u.id = ${onlyUserId}` : sql``}
    ORDER BY value_won DESC, deals_won DESC
  `)) as unknown as ProductivityRow[];
}

export function parsePeriod(from?: string, to?: string): Period {
  const toDate = to ? new Date(`${to}T23:59:59`) : new Date();
  const fromDate = from ? new Date(`${from}T00:00:00`) : new Date(toDate.getTime() - 29 * 86_400_000);
  return { from: fromDate, to: toDate };
}
