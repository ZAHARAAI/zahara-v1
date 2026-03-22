/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DemoPhase, useDemoStore, useSeedVersion } from "@/hooks/useDemoStore";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentListSkeleton } from "@/components/ui/SkeletonCard";
import { Bot, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import VibeChat from "@/components/Vibe/VibeChat";
import { useBuildersStore } from "@/hooks/useBuildersStore";
import { useShallow } from "zustand/react/shallow";

import {
  Agent,
  deleteAgent,
  listAgents,
  getAgentsStats,
  killAgent,
  type AgentStatsItem,
} from "@/services/api";
import {
  PauseCircleIcon,
  RefreshCcwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (shared formatting)
// ─────────────────────────────────────────────────────────────────────────────

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatPct01(x: number | null | undefined) {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function statusBadge(status?: string | null) {
  const s = status ?? "active";
  const base =
    "inline-flex items-center rounded-full px-2 py-[2px] text-[10px] border";
  if (s === "active")
    return (
      <span
        className={`${base} bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-200 text-emerald-600`}
      >
        active
      </span>
    );
  if (s === "paused")
    return (
      <span
        className={`${base} bg-yellow-500/10 border-yellow-500/30 dark:text-yellow-200 text-yellow-600`}
      >
        paused
      </span>
    );
  return (
    <span className={`${base} bg-zinc-500/10 border-zinc-500/30 text-zinc-200`}>
      retired
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SeedDemoCTAButton (local — keeps VibePage self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function SeedDemoCTAButton({
  seeding,
  onSeed,
}: {
  seeding: boolean;
  onSeed: () => void;
}) {
  return (
    <Button
      size="xs"
      variant="primary"
      onClick={onSeed}
      disabled={seeding}
      className="gap-1.5"
    >
      {seeding ? "Seeding…" : "Seed demo data"}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VibePage
// ─────────────────────────────────────────────────────────────────────────────

export default function VibePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statsByAgent, setStatsByAgent] = useState<
    Record<string, AgentStatsItem>
  >({});

  // Sync agent selection with BuildersStore so deep-links and mode switches work
  const { selectedAgentId, setSelectedAgentId } = useBuildersStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      setSelectedAgentId: s.setSelectedAgentId,
    })),
  );

  const [loadingLeft, setLoadingLeft] = useState(false);
  const [deleteAgentIdx, SetDeleteAgentIdx] = useState<number>(-1);

  // Demo store wiring
  const demoPhase = useDemoStore((s) => s.phase);
  const demoSeed = useDemoStore.getState().seed;
  const seedVersion = useSeedVersion();

  // Abort guard for loadLeftPane (prevents stale response overwrite)
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadLeftPane();
    return () => {
      loadAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevSeedVersionRef = useRef(seedVersion);
  useEffect(() => {
    if (seedVersion === prevSeedVersionRef.current) return;
    prevSeedVersionRef.current = seedVersion;
    void loadLeftPane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedVersion]);

  async function loadLeftPane() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoadingLeft(true);
    try {
      const [items, stats] = await Promise.all([
        listAgents(),
        getAgentsStats("7d"),
      ]);
      if (controller.signal.aborted) return;

      setAgents(items);
      const map: Record<string, AgentStatsItem> = {};
      for (const s of stats) map[s.agent_id] = s;
      setStatsByAgent(map);

      if (!selectedAgentId && items.length > 0) setSelectedAgentId(items[0].id);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      toast.error(err?.message ?? "Failed to load agents");
    } finally {
      if (!loadAbortRef.current?.signal.aborted) setLoadingLeft(false);
    }
  }

  async function reloadStatsOnly() {
    try {
      const stats = await getAgentsStats("7d");
      const map: Record<string, AgentStatsItem> = {};
      for (const s of stats) map[s.agent_id] = s;
      setStatsByAgent(map);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to reload stats");
    }
  }

  async function handleDeleteAgent(id: string, idx: number) {
    try {
      SetDeleteAgentIdx(idx);
      await deleteAgent(id);
      const rest = agents.filter((a) => a.id !== id);
      setAgents(rest);
      setStatsByAgent((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      if (selectedAgentId === id) {
        const next =
          rest.length > 0 ? rest[Math.min(idx, rest.length - 1)].id : null;
        setSelectedAgentId(next);
      }
      const saved = localStorage.getItem("zahara.flow.lastAgentId");
      if (saved === id) localStorage.removeItem("zahara.flow.lastAgentId");
      toast.info("Deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete agent");
    } finally {
      SetDeleteAgentIdx(-1);
    }
  }

  async function handleKillAgent(id: string) {
    try {
      await killAgent(id);
      toast.success("Agent paused + running runs cancelled");
      await reloadStatsOnly();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to kill agent");
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const selectedStatus = selectedAgent
    ? (statsByAgent[selectedAgent.id]?.status ??
      selectedAgent.status ??
      "active")
    : null;

  return (
    <div className="flex h-full rounded-2xl border border-border overflow-hidden">
      {/* ── Left: Agent list ── */}
      <div className="w-72 border-r border-border bg-bg flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-medium">Agents</span>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={loadingLeft}
              onClick={() => void loadLeftPane()}
            >
              {loadingLeft ? "Loading…" : "Reload"}
            </Button>
            <button
              type="button"
              className="p-1 rounded-md hover:bg-muted"
              title="Reload stats"
              onClick={() => void reloadStatsOnly()}
            >
              <RefreshCcwIcon className="h-4 w-4 text-muted_fg" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "hsl(var(--border)) transparent",
          }}
        >
          {loadingLeft || demoPhase === "seeding" ? (
            <AgentListSkeleton rows={3} />
          ) : agents.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Bot className="h-4 w-4" />}
              title="No agents yet"
              description="Seed demo data to start in seconds, or create one from Flow."
              action={
                <SeedDemoCTAButton
                  seeding={(demoPhase as DemoPhase) === "seeding"}
                  onSeed={() => void demoSeed({ force: false })}
                />
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {agents.map((agent, idx) => {
                const active = agent.id === selectedAgentId;
                const s = statsByAgent[agent.id];
                const agentStatus = s?.status ?? "active";
                const budget = s?.budget_daily_usd ?? null;
                const spentToday = s?.spent_today_usd ?? 0;
                const hasBudget = budget != null && budget > 0;
                const pct = hasBudget ? clamp01(spentToday / budget) : 0;

                return (
                  <li
                    key={agent.id}
                    className={`flex flex-col gap-2 px-3 py-2 hover:bg-muted ${active ? "bg-muted" : ""}`}
                  >
                    <div className="group flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => setSelectedAgentId(agent.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate text-[12px]">
                            {agent.name}
                          </div>
                          {statusBadge(agentStatus)}
                        </div>
                        <div className="text-[11px] text-muted_fg line-clamp-2 ">
                          {agent.description ?? agent.slug}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted_fg">
                          <span>{s ? `${s.runs} runs` : "— runs"}</span>
                          <span>•</span>
                          <span>{s ? formatPct01(s.success_rate) : "—"}</span>
                          <span>•</span>
                          <span>{s ? formatUsd(s.cost_total_usd) : "—"}</span>
                        </div>
                        <div className="mt-2 rounded-xl border border-border bg-panel px-2 py-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 text-muted_fg">
                              <span>Today</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted_fg">
                                {hasBudget
                                  ? `budget ${formatUsd(budget)}`
                                  : "no budget"}
                              </span>
                            </div>
                            <div className="text-muted_fg">
                              <span className="text-foreground">
                                {formatUsd(spentToday)}
                              </span>
                              {hasBudget && (
                                <span className="ml-1 text-muted_fg">
                                  ({Math.round(pct * 100)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-accent"
                              style={{ width: `${hasBudget ? pct * 100 : 0}%` }}
                            />
                          </div>
                          {hasBudget && pct >= 1 && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-200">
                              <ShieldAlertIcon className="h-4 w-4" />
                              Budget exceeded
                            </div>
                          )}
                        </div>
                      </button>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          title="Kill (pause + cancel runs)"
                          className="p-1 rounded-md hover:bg-muted"
                          onClick={() => void handleKillAgent(agent.id)}
                          disabled={agentStatus !== "active"}
                        >
                          <PauseCircleIcon
                            className={`h-5 w-5 ${agentStatus !== "active" ? "text-muted_fg" : "text-yellow-500 dark:text-yellow-200"}`}
                          />
                        </button>
                        <button
                          onClick={() => void handleDeleteAgent(agent.id, idx)}
                          className="p-1 mt-10 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete agent"
                          disabled={deleteAgentIdx == idx}
                        >
                          {deleteAgentIdx == idx ? (
                            <Loader2Icon className="h-5 w-5 text-red-400 animate-spin " />
                          ) : (
                            <Trash2Icon className="h-5 w-5 text-red-300 hover:text-red-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Right: VibeChat (History + Console + Input) ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <VibeChat
          agentId={selectedAgentId}
          agentName={selectedAgent?.name}
          agentStatus={selectedStatus as string | null}
        />
      </div>
    </div>
  );
}
