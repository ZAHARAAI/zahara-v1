/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  getAgentsStats,
  listAgents,
  patchAgent,
  killAgent,
  type Agent,
  type AgentStatsItem,
} from "@/services/api";
import { Button } from "@/components/ui/Button";

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

      // also include agents that have no runs yet (not present in stats)
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

  async function kill(agent_id: string) {
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
    <div className="space-y-4">
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

      <div className="rounded-2xl border border-border bg-panel w-[calc(100dvw-250px)] h-[calc(100dvh-110px)] overflow-auto">
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
              <tr>
                <td className="px-4 py-6 text-sm opacity-70" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm opacity-70" colSpan={8}>
                  No agents found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const budget = r.budget_daily_usd ?? 0;
                const spent = r.spent_today_usd ?? 0;
                const ratio =
                  budget > 0 ? Math.max(0, Math.min(1, spent / budget)) : 0;

                return (
                  <tr key={r.agent_id}>
                    {/* Agent */}
                    <td className="px-4 py-3 bg-muted">
                      <Link
                        href={`/agents/${encodeURIComponent(r.agent_id)}`}
                        className="font-medium uppercase hover:underline"
                        title="Open agent details"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs opacity-70">{r.slug}</div>
                      <div className="text-xs opacity-70 text-nowrap ">
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

                        <button
                          className="h-9 rounded-xl border border-border bg-red-500 px-3 font-semibold text-sm hover:bg-red-200 disabled:opacity-50 text-white hover:text-red-500"
                          disabled={!!killing[r.agent_id]}
                          onClick={() => kill(r.agent_id)}
                          title="Pause agent and cancel running runs"
                        >
                          {killing[r.agent_id] ? "Killing…" : "Kill"}
                        </button>
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

{
  /* detail row */
}
{
  /* <tr key={`${r.agent_id}-detail`}>
                      <td
                        className="px-4 pb-3 pt-0 text-xs opacity-70"
                        colSpan={8}
                      >
                        <span className="mr-4">
                          Avg latency: {ms(r.avg_latency_ms)}
                        </span>
                        <span className="mr-4">
                          P95: {ms(r.p95_latency_ms)}
                        </span>
                        <span>Tokens: {r.tokens_total.toLocaleString()}</span>
                      </td>
                    </tr> */
}
