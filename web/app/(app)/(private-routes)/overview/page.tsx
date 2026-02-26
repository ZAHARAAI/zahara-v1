/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import {
  getAgentsStatsSummary,
  listRuns,
  listAudit,
  type RunsByDayPoint,
  type RunListItem,
  type AuditLogItem,
} from "@/services/api";

function fmtUsd(n: number) {
  if (Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtMs(n: number) {
  if (Number.isNaN(n)) return "—";
  return `${Math.round(n)}ms`;
}

function fmtPct01(x: number) {
  if (Number.isNaN(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs opacity-60">{sub}</div> : null}
    </div>
  );
}

function RowLabel({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="truncate opacity-80">{left}</div>
      <div className="shrink-0 font-mono text-xs opacity-70">{right}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [recentRuns, setRecentRuns] = useState<RunListItem[]>([]);
  const [audit, setAudit] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, runsRes, auditRes] = await Promise.all([
        getAgentsStatsSummary("7d"),
        listRuns({ limit: 12, offset: 0 }),
        listAudit({ limit: 12, offset: 0 }),
      ]);

      setSummary(s);
      setRecentRuns(runsRes.items ?? []);
      setAudit(auditRes.items ?? []);
    } catch (err: any) {
      console.error("Failed to load overview", err);
      toast.error(err?.message ?? "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    const pts: RunsByDayPoint[] = summary?.runs_by_day ?? [];
    return pts.map((p) => ({
      date: p.date,
      runs: p.runs,
      cost_usd: p.cost_usd,
      tokens_total: p.tokens_total,
    }));
  }, [summary]);

  const kpis = useMemo(() => {
    const s = summary;
    if (!s)
      return {
        totalRuns: "—",
        successRate: "—",
        tokens: "—",
        cost: "—",
        avgLatency: "—",
        p95Latency: "—",
      };

    return {
      totalRuns: String(s.total_runs ?? 0),
      successRate: fmtPct01(Number(s.success_rate ?? 0)),
      tokens: String(s.tokens_total ?? 0),
      cost: fmtUsd(Number(s.cost_total_usd ?? 0)),
      avgLatency: fmtMs(Number(s.avg_latency_ms ?? 0)),
      p95Latency: fmtMs(Number(s.p95_latency_ms ?? 0)),
    };
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Overview</div>
          <div className="text-sm opacity-70">
            Last 7 days • realtime from runs + audit
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-border bg-panel px-3 py-2 text-sm hover:bg-muted"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card title="Runs" value={kpis.totalRuns} />
        <Card title="Success" value={kpis.successRate} />
        <Card title="Tokens" value={kpis.tokens} />
        <Card title="Cost" value={kpis.cost} />
        <Card title="Avg latency" value={kpis.avgLatency} />
        <Card title="P95 latency" value={kpis.p95Latency} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">7-day activity</div>
              <div className="text-xs opacity-70">Runs + cost</div>
            </div>
          </div>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "hsl(var(--fg-secondary))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: "hsl(var(--fg-secondary))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: "hsl(var(--fg-secondary))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--panel))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="runs"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cost_usd"
                  stroke="hsl(var(--fg-secondary))"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4 pr-0">
          <div className="text-sm font-medium">Recent runs</div>
          <div className="mt-3 space-y-2 h-90 overflow-y-auto pr-2">
            {recentRuns.length === 0 ? (
              <div className="text-sm opacity-60">No runs yet</div>
            ) : (
              recentRuns.slice(0, 10).map((r) => (
                <Link
                  key={r.id}
                  href={`/clinic?runId=${encodeURIComponent(r.id)}`}
                  className="block rounded-xl border border-border px-3 py-2 hover:bg-muted/30"
                  title="Open in Clinic"
                >
                  <RowLabel
                    left={`${r.status} • ${r.model ?? "—"}`}
                    right={new Date(r.created_at).toLocaleString()}
                  />
                  <div className="mt-1 text-xs opacity-70">
                    id: <span className="font-mono">{r.id}</span>
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    cost:{" "}
                    <span className="font-medium">
                      {typeof r.cost_estimate_usd === "number"
                        ? fmtUsd(Number(r.cost_estimate_usd))
                        : "—"}
                    </span>
                    {typeof r.cost_estimate_usd !== "number" &&
                    Number(r.tokens_total ?? 0) > 0 ? (
                      <span
                        className="ml-1 inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] opacity-80"
                        title="~ indicates cost is not stored for this run; shown as unknown/estimated."
                      >
                        ~
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="text-sm font-medium">Audit feed</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {audit.length === 0 ? (
            <div className="text-sm opacity-60">No audit events yet</div>
          ) : (
            audit.slice(0, 12).map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-border px-3 py-2"
              >
                <RowLabel
                  left={a.event_type}
                  right={new Date(a.created_at).toLocaleString()}
                />
                <div className="mt-1 text-xs opacity-70">
                  {a.entity_type
                    ? `${a.entity_type}: ${a.entity_id ?? "—"}`
                    : "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
