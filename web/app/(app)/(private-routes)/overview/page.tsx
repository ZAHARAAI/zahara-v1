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
  Activity,
  RefreshCw,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react";
import {
  getAgentsStatsSummary,
  listRuns,
  listAudit,
  type RunsByDayPoint,
  type RunListItem,
  type AuditLogItem,
} from "@/services/api";
import { toPlainDecimal } from "@/lib/utilities";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBar, SkeletonBlock } from "@/components/ui/SkeletonCard";
import { useDemoStore } from "@/hooks/useDemoStore";

// ── Formatters ────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
function fmtMs(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}ms`;
}
function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function statusDot(status: string) {
  const colors: Record<string, string> = {
    success: "bg-emerald-400",
    error: "bg-red-400",
    cancelled: "bg-amber-400",
    running: "bg-sky-400 animate-pulse",
    pending: "bg-muted_fg",
  };
  return colors[status] ?? "bg-muted_fg";
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({
  title,
  value,
  sub,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4 shadow-sm flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-widest text-muted_fg">
        {title}
      </div>
      {loading ? (
        <>
          <SkeletonBar width="w-16" height="h-7" className="mt-1 rounded-lg" />
          <SkeletonBar width="w-10" height="h-2" className="mt-1" />
        </>
      ) : (
        <>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="text-[11px] text-muted_fg">{sub}</div>}
        </>
      )}
    </div>
  );
}

// ── Chart skeleton ────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="h-72 flex items-end gap-2 px-2 pb-2">
      {[40, 65, 30, 80, 55, 90, 45].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded bg-muted animate-pulse"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [recentRuns, setRecentRuns] = useState<RunListItem[]>([]);
  const [audit, setAudit] = useState<AuditLogItem[]>([]);

  const demoPhase = useDemoStore((s) => s.phase);
  const demoSeed = useDemoStore((s) => s.seed);

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
      toast.error(err?.message ?? "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    const pts: RunsByDayPoint[] = summary?.runs_by_day ?? [];
    return pts.map((p) => ({
      date: p.date?.slice(5) ?? "", // MM-DD
      runs: p.runs,
      cost_usd: toPlainDecimal(p.cost_usd),
    }));
  }, [summary]);

  const kpis = useMemo(() => {
    const s = summary;
    if (!s || loading)
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
      tokens: Number(s.tokens_total ?? 0).toLocaleString(),
      cost: fmtUsd(Number(s.cost_total_usd ?? 0)),
      avgLatency: fmtMs(Number(s.avg_latency_ms ?? 0)),
      p95Latency: fmtMs(Number(s.p95_latency_ms ?? 0)),
    };
  }, [summary, loading]);

  const isEmpty =
    !loading && recentRuns.length === 0 && (summary?.total_runs ?? 0) === 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xl font-semibold flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-muted_fg" />
            Overview
          </div>
          <div className="text-[12px] text-muted_fg mt-0.5">
            Last 7 days · live from runs + audit
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-panel px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Runs" value={kpis.totalRuns} loading={loading} />
        <KpiCard title="Success" value={kpis.successRate} loading={loading} />
        <KpiCard title="Tokens" value={kpis.tokens} loading={loading} />
        <KpiCard title="Cost" value={kpis.cost} loading={loading} />
        <KpiCard
          title="Avg latency"
          value={kpis.avgLatency}
          loading={loading}
        />
        <KpiCard
          title="P95 latency"
          value={kpis.p95Latency}
          loading={loading}
        />
      </div>

      {/* Chart + Recent runs */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 7-day chart */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-sm font-medium">7-day activity</div>
              <div className="text-[11px] text-muted_fg">
                Runs (solid) · Cost USD (dashed)
              </div>
            </div>
          </div>
          <div className="mt-3 h-72">
            {loading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  size="sm"
                  icon={<Activity className="h-4 w-4" />}
                  title="No activity yet"
                  description="Run an agent to see data here."
                />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-fg, 150 10% 55%))",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-fg, 150 10% 55%))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-fg, 150 10% 55%))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
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
                    stroke="hsl(var(--fg-secondary, 150 10% 55%))"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent runs */}
        <div className="rounded-2xl border border-border bg-panel p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Recent runs</div>
            <Link
              href="/clinic"
              className="text-[11px] text-muted_fg hover:text-fg transition-colors"
            >
              View all →
            </Link>
          </div>

          <div
            className="flex-1 overflow-y-auto space-y-1.5 max-h-[300px]"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "hsl(var(--border)) transparent",
            }}
          >
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border px-3 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <SkeletonBar width="w-20" height="h-3" />
                    <SkeletonBar
                      width="w-14"
                      height="h-4"
                      className="rounded-full"
                    />
                  </div>
                  <SkeletonBar width="w-3/4" height="h-2" />
                </div>
              ))
            ) : isEmpty ? (
              <EmptyState
                size="sm"
                icon={<Activity className="h-4 w-4" />}
                title="No runs yet"
                description="Seed demo data to see runs."
                action={
                  <button
                    onClick={() => void demoSeed({ force: false })}
                    disabled={demoPhase === "seeding"}
                    className="text-[11px] text-accent hover:underline disabled:opacity-50"
                  >
                    {demoPhase === "seeding" ? "Seeding…" : "Seed demo →"}
                  </button>
                }
              />
            ) : (
              recentRuns.slice(0, 10).map((r) => (
                <Link
                  key={r.id}
                  href={`/clinic?runId=${encodeURIComponent(r.id)}`}
                  className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2 hover:bg-muted/40 transition-colors group"
                >
                  {/* Status dot */}
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusDot(r.status)}`}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Prompt preview */}
                    {r.input && (
                      <div className="text-[11px] text-fg truncate">
                        {r.input.length > 55
                          ? r.input.slice(0, 55) + "…"
                          : r.input}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted_fg">
                      <span className="capitalize">{r.status}</span>
                      {r.model && <span>· {r.model}</span>}
                      {r.cost_estimate_usd != null && (
                        <span>· {fmtUsd(Number(r.cost_estimate_usd))}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted_fg/50 mt-0.5">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted_fg/40 group-hover:text-accent transition-colors shrink-0 mt-0.5">
                    →
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Audit feed */}
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted_fg" />
            Audit feed
          </div>
          <Link
            href="/audit"
            className="text-[11px] text-muted_fg hover:text-fg transition-colors"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <SkeletonBar width="w-32" height="h-3" />
                  <SkeletonBar width="w-20" height="h-2" />
                </div>
                <SkeletonBar width="w-24" height="h-2" />
              </div>
            ))}
          </div>
        ) : audit.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<ClipboardList className="h-4 w-4" />}
            title="No audit events yet"
            description="Actions like seeding, running, and killing agents appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {audit.slice(0, 12).map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-fg truncate">
                    {a.event_type}
                  </span>
                  <span className="text-[10px] text-muted_fg shrink-0">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted_fg">
                  {a.entity_type
                    ? `${a.entity_type}: ${a.entity_id ?? "—"}`
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
