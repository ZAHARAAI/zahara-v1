/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import {
  getAgent,
  getAgentStatsDetail,
  listRuns,
  listAudit,
  patchAgent,
  killAgent,
  type Agent,
  type AgentStatsDetail,
  type RunListItem,
  type AuditLogItem,
} from "@/services/api";

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}
function fmtMs(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
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

type ChartPoint = {
  date: string;
  runs: number;
  cost_usd: number;
};

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();

  const agentId = params.agentId;

  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [loading, setLoading] = useState(true);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStatsDetail | null>(null);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [audit, setAudit] = useState<AuditLogItem[]>([]);

  const [editingStatus, setEditingStatus] = useState<Agent["status"]>("active");
  const [editingBudget, setEditingBudget] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [killing, setKilling] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, st, rr, aa] = await Promise.all([
        getAgent(agentId),
        getAgentStatsDetail(agentId, period),
        listRuns({ limit: 200, offset: 0, agent_id: agentId }),
        listAudit({
          limit: 50,
          offset: 0,
          entity_type: "agent",
          entity_id: agentId,
        }),
      ]);

      const agentObj = a.agent;
      setAgent(agentObj);
      setStats(st);
      setRuns(rr.items ?? []);
      setAudit(aa.items ?? []);

      setEditingStatus((agentObj.status as any) ?? "active");
      setEditingBudget(
        typeof agentObj.budget_daily_usd === "number"
          ? agentObj.budget_daily_usd
          : 0,
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, period]);

  const chartData: ChartPoint[] = useMemo(() => {
    // Build a simple day-bucket timeseries from runs list.
    // If period=all and there are a lot of runs, we still only fetched 200.
    const m = new Map<string, { runs: number; cost: number }>();

    for (const r of runs) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const prev = m.get(key) ?? { runs: 0, cost: 0 };
      prev.runs += 1;
      prev.cost += Number(r.cost_estimate_usd ?? 0);
      m.set(key, prev);
    }

    const pts = Array.from(m.entries())
      .map(([date, v]) => ({
        date,
        runs: v.runs,
        cost_usd: Number(v.cost.toFixed(4)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // For 7d/30d we want to show empty days too.
    const wantDays = period === "7d" ? 7 : period === "30d" ? 30 : null;
    if (!wantDays) return pts;

    const today = new Date();
    const out: ChartPoint[] = [];
    for (let i = wantDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const v = m.get(key);
      out.push({
        date: key,
        runs: v?.runs ?? 0,
        cost_usd: v ? Number(v.cost.toFixed(4)) : 0,
      });
    }
    return out;
  }, [runs, period]);

  const spentTodayUsd = useMemo(() => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    const pt = chartData.find((x) => x.date === key);
    return pt?.cost_usd ?? 0;
  }, [chartData]);

  const spentTodayIsApprox = useMemo(() => {
    // 1) Prefer backend truth (ultimate correctness)
    const backendFlag = (stats as any)?.spent_today_is_approximate;
    if (typeof backendFlag === "boolean") return backendFlag;

    // 2) Fallback: derive from today's runs (prefer explicit run flag if present)
    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth();
    const da = today.getDate();

    return (runs ?? []).some((r: any) => {
      const d = new Date(r.created_at);
      const isToday =
        d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da;
      if (!isToday) return false;

      // Prefer explicit API flag if available
      if (typeof r.cost_is_approximate === "boolean")
        return r.cost_is_approximate;

      // Last-resort inference (old behavior)
      const hasTokens = Number(r.tokens_total ?? 0) > 0;
      const missingCost =
        r.cost_estimate_usd === null ||
        typeof r.cost_estimate_usd === "undefined";
      return hasTokens && missingCost;
    });
  }, [stats, runs]);

  const budgetRatio = useMemo(() => {
    const b = Number(editingBudget ?? 0);
    if (!(b > 0)) return 0;
    return Math.max(0, Math.min(1, spentTodayUsd / b));
  }, [spentTodayUsd, editingBudget]);

  async function save() {
    setSaving(true);
    try {
      await patchAgent(agentId, {
        status: editingStatus as any,
        budget_daily_usd: Number(editingBudget ?? 0),
      } as any);
      toast.success("Saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function kill() {
    setKilling(true);
    try {
      const res = await killAgent(agentId);
      toast.success(
        `Killed: paused agent, cancelled ${res.cancelled_runs ?? 0} runs`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Kill failed");
    } finally {
      setKilling(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-border bg-panel px-3 py-2 text-sm hover:bg-muted"
            >
              ← Back
            </button>
            <Link
              href="/agents"
              className="text-sm opacity-70 hover:underline"
              title="All agents"
            >
              Agents
            </Link>
            <span className="text-sm opacity-50">/</span>
            <span className="text-sm font-mono opacity-70">{agentId}</span>
          </div>

          <h1 className="text-2xl font-semibold">
            {agent?.name ?? (loading ? "Loading…" : "Agent")}
          </h1>
          <div className="text-sm opacity-70">{agent?.slug ?? ""}</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm flex justify-center items-center hover:bg-muted "
            href={`/flow?agentId=${agentId}`}
          >
            Open in Flow
          </Link>
          <select
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            title="Stats period"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>

          <button
            onClick={load}
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm hover:bg-muted disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">
              Status
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-border opacity-90">
                {editingStatus ?? "active"}
              </span>
              <select
                className="h-10 rounded-xl border border-border bg-panel px-3 text-sm"
                value={(editingStatus ?? "active") as any}
                onChange={(e) => setEditingStatus(e.target.value as any)}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="retired">retired</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">
              Daily budget (USD/day)
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="h-10 w-40 rounded-xl border border-border bg-panel px-3 text-sm"
                type="number"
                min={0}
                step={0.5}
                value={editingBudget}
                onChange={(e) => setEditingBudget(Number(e.target.value))}
              />
              <div className="text-sm opacity-70">
                Today:{" "}
                <span className="font-medium">{fmtUsd(spentTodayUsd)}</span>{" "}
                {spentTodayIsApprox ? (
                  <span
                    className="ml-1 inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] opacity-80"
                    title="~ indicates some runs are missing stored cost; spend is best-effort."
                  >
                    ~
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-foreground/60"
                style={{ width: `${Math.round(budgetRatio * 100)}%` }}
                title={`${fmtUsd(spentTodayUsd)} / ${fmtUsd(editingBudget)}`}
              />
            </div>
          </div>

          <div className="flex items-end justify-start gap-2 md:justify-end">
            <button
              className="h-10 rounded-xl border border-border px-4 text-sm hover:bg-muted disabled:opacity-50"
              onClick={save}
              disabled={saving}
              title="Save status + budget"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="h-10 rounded-xl border border-border px-4 text-sm hover:bg-muted disabled:opacity-50"
              onClick={kill}
              disabled={killing}
              title="Pause agent and cancel running runs"
            >
              {killing ? "Killing…" : "Kill"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card title="Runs" value={String(stats?.runs ?? 0)} />
        <Card
          title="Success"
          value={fmtPct01(Number(stats?.success_rate ?? 0))}
        />
        <Card title="Tokens" value={String(stats?.tokens_total ?? 0)} />
        <Card title="Cost" value={fmtUsd(Number(stats?.cost_total_usd ?? 0))} />
        <Card
          title="Avg latency"
          value={fmtMs(Number(stats?.avg_latency_ms ?? 0))}
        />
        <Card
          title="P95 latency"
          value={fmtMs(Number(stats?.p95_latency_ms ?? 0))}
        />
      </div>

      {/* Chart + lists */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Activity</div>
              <div className="text-xs opacity-70">
                Runs + cost (bucketed by day)
              </div>
            </div>
          </div>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="runs"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cost_usd"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-medium">Recent runs</div>
          <div className="mt-3 space-y-2">
            {runs.length === 0 ? (
              <div className="text-sm opacity-60">No runs yet</div>
            ) : (
              runs.slice(0, 12).map((r) => (
                <Link
                  key={r.id}
                  href={`/clinic?runId=${encodeURIComponent(r.id)}`}
                  className="block rounded-xl border border-border px-3 py-2 hover:bg-muted"
                  title="Open this run in Clinic timeline"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="truncate opacity-80">
                      {r.status} • {r.model ?? "—"}
                    </div>
                    <div className="shrink-0 font-mono text-xs opacity-70">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    id: <span className="font-mono">{r.id}</span>
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    cost: {fmtUsd(Number(r.cost_estimate_usd ?? 0))} • tokens:{" "}
                    {Number(r.tokens_total ?? 0).toLocaleString()}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="text-sm font-medium">Audit (this agent)</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {audit.length === 0 ? (
            <div className="text-sm opacity-60">No audit events yet</div>
          ) : (
            audit.slice(0, 20).map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="truncate opacity-80">{a.event_type}</div>
                  <div className="shrink-0 font-mono text-xs opacity-70">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
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
