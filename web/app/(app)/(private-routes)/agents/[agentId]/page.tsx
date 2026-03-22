/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { toPlainDecimal } from "@/lib/utilities";

// Auto-dismiss for kill confirm
const KILL_CONFIRM_DISMISS_MS = 3_000;

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

  // ── Core edit state ──────────────────────────────────────────────────
  const [editingStatus, setEditingStatus] = useState<Agent["status"]>("active");
  const [editingBudget, setEditingBudget] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // ── Kill 2-click confirm ─────────────────────────────────────────────
  const [killConfirming, setKillConfirming] = useState(false);
  const [killing, setKilling] = useState(false);
  const killTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Guardrail edit state (Job9) ──────────────────────────────────────
  // tool_allowlist stored as comma-separated string in the input
  const [editingAllowlist, setEditingAllowlist] = useState<string>("");
  const [editingMaxSteps, setEditingMaxSteps] = useState<string>("");
  const [editingMaxDuration, setEditingMaxDuration] = useState<string>("");

  useEffect(() => {
    return () => {
      if (killTimerRef.current) clearTimeout(killTimerRef.current);
    };
  }, []);

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

      // Populate guardrail fields
      const allowlist = agentObj.tool_allowlist;
      setEditingAllowlist(Array.isArray(allowlist) ? allowlist.join(", ") : "");
      setEditingMaxSteps(
        agentObj.max_steps_per_run != null
          ? String(agentObj.max_steps_per_run)
          : "",
      );
      setEditingMaxDuration(
        agentObj.max_duration_seconds_per_run != null
          ? String(agentObj.max_duration_seconds_per_run)
          : "",
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
    if (typeof stats?.spent_today_usd === "number")
      return toPlainDecimal(stats.spent_today_usd);

    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    const pt = chartData.find((x) => x.date === key);
    return toPlainDecimal(pt?.cost_usd ?? 0);
  }, [stats, chartData]);

  const spentTodayIsApprox = useMemo(() => {
    const backendFlag = (stats as any)?.spent_today_is_approximate;
    if (typeof backendFlag === "boolean") return backendFlag;

    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth();
    const da = today.getDate();

    return (runs ?? []).some((r: any) => {
      const d = new Date(r.created_at);
      const isToday =
        d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da;
      if (!isToday) return false;
      if (typeof r.cost_is_approximate === "boolean")
        return r.cost_is_approximate;
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
    return Math.max(0, Math.min(1, Number(spentTodayUsd) / b));
  }, [spentTodayUsd, editingBudget]);

  // ── Save: includes guardrail fields ──────────────────────────────────
  async function save() {
    setSaving(true);
    try {
      // Parse tool_allowlist from comma-separated string
      const rawAllowlist = editingAllowlist.trim();
      const tool_allowlist: string[] | null =
        rawAllowlist === ""
          ? null
          : rawAllowlist
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

      // Parse integer guardrail fields (empty string → null = unlimited)
      const max_steps_per_run =
        editingMaxSteps.trim() === ""
          ? null
          : parseInt(editingMaxSteps.trim(), 10) || null;

      const max_duration_seconds_per_run =
        editingMaxDuration.trim() === ""
          ? null
          : parseInt(editingMaxDuration.trim(), 10) || null;

      await patchAgent(agentId, {
        status: editingStatus as any,
        budget_daily_usd: Number(editingBudget ?? 0),
        tool_allowlist,
        max_steps_per_run,
        max_duration_seconds_per_run,
      });
      toast.success("Saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Kill: 2-click confirm pattern ────────────────────────────────────
  function handleKillClick() {
    if (killing) return;

    if (killConfirming) {
      // Second click — confirmed
      if (killTimerRef.current) clearTimeout(killTimerRef.current);
      setKillConfirming(false);
      void executeKill();
    } else {
      // First click — arm confirm with auto-dismiss
      if (killTimerRef.current) clearTimeout(killTimerRef.current);
      setKillConfirming(true);
      killTimerRef.current = setTimeout(() => {
        setKillConfirming(false);
      }, KILL_CONFIRM_DISMISS_MS);
    }
  }

  async function executeKill() {
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
      {/* ── Page header ── */}
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
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm flex justify-center items-center hover:bg-muted"
            href={`/builders?v=vibe&agentId=${encodeURIComponent(agentId)}`}
          >
            Open in Builder
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

      {/* ── Controls: status + budget + actions ── */}
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Status */}
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70 mb-2">
              Status
            </div>
            <div className="flex items-center gap-2">
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

          {/* Daily budget */}
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70 mb-2">
              Daily budget (USD/day)
            </div>
            <div className="flex items-center gap-2">
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
                <span className="font-medium">
                  {fmtUsd(Number(spentTodayUsd))}
                </span>{" "}
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
                title={`${fmtUsd(Number(spentTodayUsd))} / ${fmtUsd(editingBudget)}`}
              />
            </div>
          </div>

          {/* Actions: Save + Kill */}
          <div className="flex items-end justify-start gap-2 md:justify-end">
            <button
              className="h-10 rounded-xl border border-border px-4 text-sm hover:bg-muted disabled:opacity-50"
              onClick={save}
              disabled={saving}
              title="Save all settings"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {/* Kill: 2-click confirm */}
            {killing ? (
              <button
                disabled
                className="h-10 rounded-xl border border-border px-4 text-sm opacity-50"
              >
                Killing…
              </button>
            ) : killConfirming ? (
              <button
                className="h-10 rounded-xl border border-red-500/50 bg-red-500/10 px-4 text-sm font-semibold text-red-500 hover:bg-red-500/20 animate-pulse transition-colors"
                onClick={handleKillClick}
                title="Click again to confirm — pauses agent and cancels all running runs"
              >
                Confirm kill?
              </button>
            ) : (
              <button
                className="h-10 rounded-xl border border-border px-4 text-sm text-muted_fg hover:border-red-500/40 hover:text-red-500 hover:bg-red-500/5 transition-colors"
                onClick={handleKillClick}
                title="Pause agent and cancel running runs (click twice to confirm)"
              >
                Kill
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Guardrails panel (Job9) ── */}
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium">Guardrails</div>
            <div className="text-xs text-muted_fg mt-0.5">
              Tool governance + runaway protection — enforced by the backend
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Tool allowlist */}
          <div>
            <label className="block text-xs text-muted_fg mb-1.5">
              Tool allowlist
              <span
                className="ml-1.5 cursor-help opacity-60"
                title="Comma-separated list of permitted tool names. Leave blank to block all tools (deny-by-default). Example: web_search, calculator"
              >
                ⓘ
              </span>
            </label>
            <input
              type="text"
              className="w-full h-10 rounded-xl border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-border"
              value={editingAllowlist}
              onChange={(e) => setEditingAllowlist(e.target.value)}
              placeholder="e.g. web_search, calculator"
            />
            <p className="mt-1 text-[11px] text-muted_fg">
              {editingAllowlist.trim() === ""
                ? "Empty = deny all tools (deny-by-default)"
                : `Allowing: ${editingAllowlist
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(", ")}`}
            </p>
          </div>

          {/* Max steps per run */}
          <div>
            <label className="block text-xs text-muted_fg mb-1.5">
              Max steps per run
              <span
                className="ml-1.5 cursor-help opacity-60"
                title="Maximum number of tool calls allowed per run. Leave blank for unlimited."
              >
                ⓘ
              </span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className="w-full h-10 rounded-xl border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-border"
              value={editingMaxSteps}
              onChange={(e) => setEditingMaxSteps(e.target.value)}
              placeholder="Unlimited"
            />
            <p className="mt-1 text-[11px] text-muted_fg">
              {editingMaxSteps.trim() === ""
                ? "Unlimited — no step cap"
                : `Run auto-cancelled after ${editingMaxSteps} steps`}
            </p>
          </div>

          {/* Max duration */}
          <div>
            <label className="block text-xs text-muted_fg mb-1.5">
              Max duration (seconds)
              <span
                className="ml-1.5 cursor-help opacity-60"
                title="Maximum wall-clock seconds a run may take. Leave blank for unlimited."
              >
                ⓘ
              </span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className="w-full h-10 rounded-xl border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-border"
              value={editingMaxDuration}
              onChange={(e) => setEditingMaxDuration(e.target.value)}
              placeholder="Unlimited"
            />
            <p className="mt-1 text-[11px] text-muted_fg">
              {editingMaxDuration.trim() === ""
                ? "Unlimited — no time cap"
                : `Run auto-cancelled after ${editingMaxDuration}s`}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-muted_fg">
          Click <strong>Save</strong> above to persist guardrail changes.
          Violations are recorded in the audit log with events{" "}
          <code className="font-mono">tool.blocked</code> /{" "}
          <code className="font-mono">runaway.stopped</code>.
        </p>
      </div>

      {/* ── KPI cards ── */}
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

      {/* ── Chart + recent runs ── */}
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

        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm font-medium">Recent runs</div>
          <div
            className="mt-3 max-h-[300px] space-y-2 overflow-y-auto"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "hsl(var(--border)) transparent",
            }}
          >
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

      {/* ── Audit log ── */}
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
