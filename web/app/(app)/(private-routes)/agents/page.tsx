/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Users, Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBar } from "@/components/ui/SkeletonCard";
import { useDemoStore } from "@/hooks/useDemoStore";
import {
  getAgentsStats,
  listAgents,
  patchAgent,
  killAgent,
  type Agent,
  type AgentStatsItem,
} from "@/services/api";
import { Button } from "@/components/ui/Button";

// Auto-dismiss duration (ms) for the kill confirm state
const KILL_CONFIRM_DISMISS_MS = 3_000;

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
function pct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}
function ms(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

type Row = AgentStatsItem & {
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export default function AgentsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("7d");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused" | "retired">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [killing, setKilling] = useState<Record<string, boolean>>({});

  // ── Kill confirm: stores the agent_id pending confirmation ────────────────
  const [killConfirmId, setKillConfirmId] = useState<string | null>(null);
  const killConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const demoPhase = useDemoStore((s) => s.phase);
  const demoSeed = useDemoStore((s) => s.seed);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (killConfirmTimerRef.current)
        clearTimeout(killConfirmTimerRef.current);
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [stats, agents] = await Promise.all([
        getAgentsStats(period),
        listAgents(),
      ]);

      const byId = new Map<string, Agent>();
      for (const a of agents) byId.set(a.id, a);

      const merged: Row[] = stats.map((s) => {
        const a = byId.get(s.agent_id);
        return {
          ...s,
          description: a?.description ?? null,
          created_at: a?.created_at,
          updated_at: a?.updated_at,
          status: (a?.status as any) ?? s.status ?? "active",
          budget_daily_usd:
            typeof a?.budget_daily_usd === "number"
              ? a.budget_daily_usd
              : (s.budget_daily_usd ?? null),
        };
      });

      // Include agents that have no runs yet (not present in stats)
      const inStats = new Set(stats.map((s) => s.agent_id));
      for (const a of agents) {
        if (inStats.has(a.id)) continue;
        merged.push({
          agent_id: a.id,
          name: a.name,
          slug: a.slug,
          status: (a.status as any) ?? "active",
          budget_daily_usd: a.budget_daily_usd ?? null,
          spent_today_usd: 0,
          runs: 0,
          success_rate: 0,
          tokens_total: 0,
          cost_total_usd: 0,
          avg_latency_ms: 0,
          p95_latency_ms: 0,
          description: a.description ?? null,
          created_at: a.created_at,
          updated_at: a.updated_at,
        });
      }

      merged.sort((a, b) => a.name.localeCompare(b.name));
      setRows(merged);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && (r.status ?? "active") !== status) return false;
      if (!qq) return true;
      return (
        r.name.toLowerCase().includes(qq) || r.slug.toLowerCase().includes(qq)
      );
    });
  }, [rows, q, status]);

  async function saveAgent(agent_id: string, patch: Partial<Agent>) {
    setSaving((s) => ({ ...s, [agent_id]: true }));
    try {
      await patchAgent(agent_id, patch as any);
      toast.success("Saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving((s) => ({ ...s, [agent_id]: false }));
    }
  }

  // ── Kill: first click arms confirm, second click fires ────────────────────
  function handleKillClick(agent_id: string) {
    if (killing[agent_id]) return;

    if (killConfirmId === agent_id) {
      // Second click — confirmed, execute kill
      if (killConfirmTimerRef.current)
        clearTimeout(killConfirmTimerRef.current);
      setKillConfirmId(null);
      void executeKill(agent_id);
    } else {
      // First click — arm confirm state with auto-dismiss
      if (killConfirmTimerRef.current)
        clearTimeout(killConfirmTimerRef.current);
      setKillConfirmId(agent_id);
      killConfirmTimerRef.current = setTimeout(() => {
        setKillConfirmId(null);
      }, KILL_CONFIRM_DISMISS_MS);
    }
  }

  async function executeKill(agent_id: string) {
    setKilling((s) => ({ ...s, [agent_id]: true }));
    try {
      const res = await killAgent(agent_id);
      toast.success(
        `Killed: paused agent, cancelled ${res.cancelled_runs ?? 0} runs`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Kill failed");
    } finally {
      setKilling((s) => ({ ...s, [agent_id]: false }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm opacity-70">
            Manage lifecycle, budgets, and performance stats.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>

          <select
            className="h-10 rounded-xl border border-border bg-panel px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="retired">Retired</option>
          </select>

          <input
            className="h-10 w-full sm:w-72 rounded-xl border border-border bg-panel px-3 text-sm"
            placeholder="Search name or slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div
        className="rounded-2xl border border-border bg-panel w-[calc(100dvw-257px)] h-[calc(100dvh-110px)] overflow-auto"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        <table className="w-fit">
          <thead className="border-b border-border">
            <tr className="text-xs uppercase tracking-wide opacity-70">
              <th className="px-4 py-3 text-left font-medium">Agent</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Daily budget</th>
              <th className="px-4 py-3 text-left font-medium">Today</th>
              <th className="px-4 py-3 text-left font-medium">Runs</th>
              <th className="px-4 py-3 text-left font-medium">Success</th>
              <th className="px-4 py-3 text-left font-medium">Cost</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 bg-muted">
                    <SkeletonBar width="w-28" height="h-3" className="mb-1.5" />
                    <SkeletonBar width="w-16" height="h-2" className="mb-1" />
                    <SkeletonBar width="w-40" height="h-2" />
                  </td>
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j} className="px-4 py-3">
                      <SkeletonBar width="w-12" height="h-3" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12">
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    title={
                      q || status !== "all"
                        ? "No agents match filters"
                        : "No agents yet"
                    }
                    description={
                      q || status !== "all"
                        ? "Try adjusting your search or status filter."
                        : "Seed demo data to create agents instantly, or build one in the Flow builder."
                    }
                    action={
                      !q && status === "all" ? (
                        <div className="flex flex-col items-center gap-2">
                          <button
                            onClick={() => void demoSeed({ force: false })}
                            disabled={demoPhase === "seeding"}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            {demoPhase === "seeding"
                              ? "Seeding…"
                              : "Seed demo data"}
                          </button>
                          <Link
                            href="/builders?v=flow"
                            className="inline-flex items-center gap-1.5 text-sm text-muted_fg hover:text-fg transition-colors"
                          >
                            <Layers className="h-3.5 w-3.5" />
                            Or build one in Flow →
                          </Link>
                        </div>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const budget = r.budget_daily_usd ?? 0;
                const spent = r.spent_today_usd ?? 0;
                const ratio =
                  budget > 0 ? Math.max(0, Math.min(1, spent / budget)) : 0;

                const isConfirmingKill = killConfirmId === r.agent_id;
                const isKilling = !!killing[r.agent_id];

                return (
                  <tr key={r.agent_id}>
                    {/* Agent */}
                    <td className="px-4 py-3 bg-muted">
                      <Link
                        href={`/agents/${encodeURIComponent(r.agent_id)}`}
                        className="font-medium uppercase hover:underline"
                        title="Open agent detail"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs opacity-70">{r.slug}</div>
                      <div className="text-xs opacity-70 text-nowrap">
                        <span className="mr-4">
                          Avg latency: {ms(r.avg_latency_ms)}
                        </span>
                        <span className="mr-4">
                          P95: {ms(r.p95_latency_ms)}
                        </span>
                        <span>Tokens: {r.tokens_total.toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-border ${
                            (r.status ?? "active") === "active"
                              ? "opacity-90"
                              : "opacity-70"
                          }`}
                          title="Agent lifecycle status"
                        >
                          {r.status ?? "active"}
                        </span>

                        <select
                          className="h-9 rounded-xl border border-border bg-panel px-2 text-sm"
                          value={(r.status ?? "active") as any}
                          onChange={(e) => {
                            const v = e.target.value as any;
                            setRows((prev) =>
                              prev.map((x) =>
                                x.agent_id === r.agent_id
                                  ? { ...x, status: v }
                                  : x,
                              ),
                            );
                          }}
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="retired">retired</option>
                        </select>
                      </div>
                    </td>

                    {/* Daily budget */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          className="h-9 w-28 rounded-xl border border-border bg-panel px-2 text-sm"
                          type="number"
                          min={0}
                          step={0.5}
                          value={r.budget_daily_usd ?? 0}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRows((prev) =>
                              prev.map((x) =>
                                x.agent_id === r.agent_id
                                  ? { ...x, budget_daily_usd: v }
                                  : x,
                              ),
                            );
                          }}
                        />
                        <div className="text-xs opacity-70">USD/day</div>
                      </div>

                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground/60"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                          title={`${fmtUsd(spent)} / ${fmtUsd(budget)}`}
                        />
                      </div>
                    </td>

                    {/* Today */}
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        <span>{fmtUsd(spent)}</span>
                        {r.spent_today_is_approximate ? (
                          <span
                            className="rounded-full border border-border px-1.5 py-0.5 text-[10px] opacity-80"
                            title="Today spend includes estimated costs for runs without stored cost"
                          >
                            ~
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs opacity-70">
                        {budget > 0 ? `${Math.round(ratio * 100)}%` : "0%"}
                      </div>
                    </td>

                    {/* Runs */}
                    <td className="px-4 py-3 text-sm">{r.runs}</td>

                    {/* Success */}
                    <td className="px-4 py-3 text-sm">{pct(r.success_rate)}</td>

                    {/* Cost */}
                    <td className="px-4 py-3 text-sm">
                      {fmtUsd(r.cost_total_usd)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/clinic?agentId=${encodeURIComponent(r.agent_id)}`}
                          className="h-9 inline-flex items-center rounded-xl border border-border px-3 text-sm hover:bg-muted"
                          title="Open this agent's runs in Clinic"
                        >
                          Clinic
                        </Link>

                        <Button
                          disabled={!!saving[r.agent_id]}
                          onClick={() =>
                            saveAgent(r.agent_id, {
                              status: r.status as any,
                              budget_daily_usd: r.budget_daily_usd ?? 0,
                            })
                          }
                          title="Save status + budget"
                        >
                          {saving[r.agent_id] ? "Saving…" : "Save"}
                        </Button>

                        {/* ── Kill: two-click confirm pattern ── */}
                        {isKilling ? (
                          <button
                            disabled
                            className="h-9 rounded-xl border border-border px-3 text-sm opacity-50 font-medium"
                          >
                            Killing…
                          </button>
                        ) : isConfirmingKill ? (
                          <button
                            className="h-9 rounded-xl border border-red-500/50 bg-red-500/10 px-3 text-sm font-semibold text-red-500 hover:bg-red-500/20 animate-pulse transition-colors duration-150"
                            onClick={() => handleKillClick(r.agent_id)}
                            title="Click again to confirm — pauses agent and cancels all running runs"
                          >
                            Confirm kill?
                          </button>
                        ) : (
                          <button
                            className="h-9 rounded-xl border border-border px-3 text-sm font-medium text-muted_fg hover:border-red-500/40 hover:text-red-500 hover:bg-red-500/5 transition-colors duration-150"
                            onClick={() => handleKillClick(r.agent_id)}
                            title="Pause agent and cancel running runs (click twice to confirm)"
                          >
                            Kill
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
