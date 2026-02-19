/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRunUIStore } from "@/hooks/useRunUIStore";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Agent,
  deleteAgent,
  listAgents,
  startAgentRun,
  streamRun,
  type RunEvent,
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

type ChatItem = {
  role: "user" | "assistant" | "tool" | "system";
  ts: string;
  text: string;
  kind?: string; // token/tool_call/tool_result/log/error...
};

function clip(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function safeJson(x: any): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function summarizeToolCall(payload: any): string {
  const tc =
    payload?.tool_call ??
    payload?.tool_calls?.[0] ??
    payload?.function_call ??
    payload;
  const fn = tc?.function ?? tc ?? {};
  const name = fn?.name ?? tc?.name ?? "tool";
  const args = fn?.arguments ?? tc?.arguments ?? "";
  const argsStr = typeof args === "string" ? args : safeJson(args);
  const compact = clip(argsStr.replace(/\s+/g, " ").trim(), 220);
  return compact ? `tool_call: ${name}(${compact})` : `tool_call: ${name}`;
}

function summarizeToolResult(payload: any): string {
  const tr = payload?.tool_result ?? payload?.tool_results?.[0] ?? payload;
  const name = tr?.name ?? tr?.tool_name ?? tr?.id ?? "tool";
  const out =
    tr?.content ?? tr?.output ?? tr?.result ?? tr?.text ?? tr?.value ?? "";
  const outStr = typeof out === "string" ? out : safeJson(out);
  const compact = clip(outStr.replace(/\s+/g, " ").trim(), 240);
  return compact ? `tool_result: ${name} → ${compact}` : `tool_result: ${name}`;
}

function formatUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  // Keep it simple; you can replace with Intl if you like
  return `$${n.toFixed(2)}`;
}

function formatPct01(x: number | null | undefined) {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function statusBadge(status?: string | null) {
  const s = status ?? "active";
  const base =
    "inline-flex items-center rounded-full px-2 py-[2px] text-[10px] border";
  if (s === "active")
    return (
      <span
        className={`${base} bg-emerald-500/10 border-emerald-500/30 text-emerald-200`}
      >
        active
      </span>
    );
  if (s === "paused")
    return (
      <span
        className={`${base} bg-yellow-500/10 border-yellow-500/30 text-yellow-200`}
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

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Vibe: simple chat surface for interacting with agents.
 *
 * - Left: list of agents + Job7 controls (status/budget/kill)
 * - Right: chat transcript powered by Job 6 run pipeline + SSE
 */
export default function VibePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statsByAgent, setStatsByAgent] = useState<
    Record<string, AgentStatsItem>
  >({});

  const { show, hide } = useRunUIStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const [loadingLeft, setLoadingLeft] = useState(false);

  useEffect(() => {
    void loadLeftPane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLeftPane() {
    setLoadingLeft(true);
    try {
      const [items, stats] = await Promise.all([
        listAgents(),
        getAgentsStats("7d"),
      ]);

      setAgents(items);

      const map: Record<string, AgentStatsItem> = {};
      for (const s of stats) map[s.agent_id] = s;
      setStatsByAgent(map);

      if (!selectedAgentId && items.length > 0) {
        setSelectedAgentId(items[0].id);
      }
    } catch (err: any) {
      hide();
      console.error("Failed to load agents/stats", err);
      toast.error(err?.message ?? "Failed to load agents");
    } finally {
      setLoadingLeft(false);
    }
  }

  async function reloadStatsOnly() {
    try {
      const stats = await getAgentsStats("7d");
      const map: Record<string, AgentStatsItem> = {};
      for (const s of stats) map[s.agent_id] = s;
      setStatsByAgent(map);
    } catch (err: any) {
      console.error("Failed to reload stats", err);
      toast.error(err?.message ?? "Failed to reload stats");
    }
  }

  function resetTranscript() {
    setEvents([]);
    setCurrentRunId(null);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (!selectedAgentId) {
      toast.error("Select an agent first");
      return;
    }

    // If agent is paused/retired, block early on UI too (backend already enforces)
    const st = statsByAgent[selectedAgentId]?.status ?? "active";
    if (st !== "active") {
      toast.error(`Agent is ${st}. Activate it to run.`);
      return;
    }

    setSending(true);
    setInput("");

    setEvents((prev) => [
      ...prev,
      {
        type: "log",
        ts: new Date().toISOString(),
        message: text,
        payload: { role: "user" },
      },
    ]);

    try {
      const { run_id } = await startAgentRun(selectedAgentId, {
        input: text,
        source: "vibe",
        config: { surface: "vibe" },
      });

      setCurrentRunId(run_id);
      show("BUILD", "Running…");

      const stop = streamRun(
        run_id,
        (evt) => {
          setEvents((prev) => [...prev, evt]);

          // If terminal: close
          if (
            evt.type === "done" ||
            evt.type === "error" ||
            evt.type === "cancelled"
          ) {
            hide();
            stop();
            // refresh stats after run ends (cost/tokens might update)
            void reloadStatsOnly();
          }
        },
        { autoCloseMs: 700 },
      );
    } catch (err: any) {
      hide();
      console.error("Failed to start run", err);
      // backend may return budget/status 409 with structured payload; try show message
      const msg =
        err?.detail?.error?.message ??
        err?.detail?.message ??
        err?.message ??
        "Failed to start run";
      toast.error(msg);
    } finally {
      setSending(false);
      hide();
    }
  }

  async function handleDeleteAgent(id: string, idx: number) {
    try {
      deleteAgent(id);
      const rest_items = agents.filter((a) => a.id !== id);
      setAgents(rest_items);

      // remove stats for this agent
      setStatsByAgent((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (selectedAgentId === id) {
        const isLastItem = rest_items.length == idx;
        const nextSelected =
          rest_items.length > 0
            ? rest_items[isLastItem ? idx - 1 : idx].id
            : null;
        if (nextSelected) {
          setSelectedAgentId(nextSelected);
          resetTranscript();
        }
      }

      const savedId = localStorage.getItem("zahara.flow.lastAgentId");
      if (savedId === id) {
        localStorage.removeItem("zahara.flow.lastAgentId");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete agent");
    }
  }

  async function handleKillAgent(id: string) {
    try {
      await killAgent(id);
      toast.success("Agent paused + running runs cancelled");
      await reloadStatsOnly();
    } catch (err: any) {
      console.error("Kill agent failed", err);
      toast.error(err?.message ?? "Failed to kill agent");
    }
  }

  const chatItems: ChatItem[] = useMemo(() => {
    const out: ChatItem[] = [];

    for (const e of events) {
      if (e.type === "ping" || e.type === "done") continue;

      if (e.type === "error") {
        const msg = e.message ?? e.payload?.message ?? "error";
        out.push({
          role: "system",
          ts: e.ts ?? new Date().toISOString(),
          text: typeof msg === "string" ? msg : safeJson(msg),
          kind: "error",
        });
        continue;
      }

      if (e.type === "tool_call") {
        out.push({
          role: "tool",
          ts: e.ts ?? new Date().toISOString(),
          text: summarizeToolCall(e.payload),
          kind: "tool_call",
        });
        continue;
      }
      if (e.type === "tool_result") {
        out.push({
          role: "tool",
          ts: e.ts ?? new Date().toISOString(),
          text: summarizeToolResult(e.payload),
          kind: "tool_result",
        });
        continue;
      }

      if (e.type === "token") {
        const t = (e.message ?? e.payload?.text ?? "") as string;
        if (!t) continue;

        const last = out[out.length - 1];
        if (last && last.role === "assistant" && last.kind === "token") {
          last.text += t;
        } else {
          out.push({
            role: "assistant",
            ts: e.ts ?? new Date().toISOString(),
            text: t,
            kind: "token",
          });
        }
        continue;
      }

      if (e.type === "log") {
        const role = e.payload?.role === "user" ? "user" : "system";
        const msg =
          e.message ??
          e.payload?.message ??
          e.payload?.text ??
          (typeof e.payload === "string" ? e.payload : "");
        if (!msg) continue;
        out.push({
          role,
          ts: e.ts ?? new Date().toISOString(),
          text: typeof msg === "string" ? msg : safeJson(msg),
          kind: "log",
        });
        continue;
      }

      if (e.type === "system") {
        out.push({
          role: "system",
          ts: e.ts ?? new Date().toISOString(),
          text: clip(safeJson(e.payload ?? e), 600),
          kind: "system",
        });
      }
    }

    return out;
  }, [events]);

  return (
    <div className="flex h-[calc(100vh-4rem)] rounded-2xl border border-border overflow-hidden">
      {/* Agents list */}
      <div className="w-72 border-r border-border bg-bg flex flex-col">
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

        <div className="flex-1 overflow-auto">
          {agents.length === 0 ? (
            <div className="p-3 text-[12px] text-muted_fg">
              No agents yet. Create one from Flow or the Pro API, then come back
              here.
            </div>
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
                    className={`flex flex-col gap-2 px-3 py-2 hover:bg-muted ${
                      active ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => {
                          setSelectedAgentId(agent.id);
                          resetTranscript();
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate text-[12px]">
                            {agent.name}
                          </div>
                          {statusBadge(agentStatus)}
                        </div>

                        <div className="text-[11px] text-muted_fg truncate">
                          {agent.description ?? agent.slug}
                        </div>

                        {/* Stats micro-row */}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted_fg">
                          <span title="Runs (period)">
                            {s ? `${s.runs} runs` : "— runs"}
                          </span>
                          <span>•</span>
                          <span title="Success rate">
                            {s ? formatPct01(s.success_rate) : "—"}
                          </span>
                          <span>•</span>
                          <span title="Cost (period)">
                            {s ? formatUsd(s.cost_total_usd) : "—"}
                          </span>
                        </div>

                        {/* Budget row */}
                        <div className="mt-2 rounded-xl border border-border bg-panel px-2 py-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 text-muted_fg">
                              <span>Today</span>
                              {hasBudget ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted_fg">
                                  budget {formatUsd(budget)}
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted_fg">
                                  no budget
                                </span>
                              )}
                            </div>

                            <div className="text-muted_fg">
                              <span className="text-foreground">
                                {formatUsd(spentToday)}
                              </span>
                              {hasBudget ? (
                                <span className="ml-1 text-muted_fg">
                                  ({Math.round(pct * 100)}%)
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-accent"
                              style={{ width: `${hasBudget ? pct * 100 : 0}%` }}
                            />
                          </div>

                          {hasBudget && pct >= 1 ? (
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-200">
                              <ShieldAlertIcon className="h-4 w-4" />
                              Budget exceeded
                            </div>
                          ) : null}
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
                            className={`h-5 w-5 ${
                              agentStatus !== "active"
                                ? "text-muted_fg"
                                : "text-yellow-200 hover:text-yellow-100"
                            }`}
                          />
                        </button>

                        <button
                          onClick={() => {
                            handleDeleteAgent(agent.id, idx);
                          }}
                          className="p-1 rounded-md hover:bg-muted"
                          title="Delete agent"
                        >
                          <Trash2Icon className="h-5 w-5 text-red-300 hover:text-red-400" />
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

      {/* Chat surface */}
      <div className="flex-1 flex flex-col bg-bg">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[13px] font-medium">
              {selectedAgentId
                ? `Chat with agent ${selectedAgentId}`
                : "Select an agent to start chatting"}
            </div>
            <div className="text-[11px] text-muted_fg">
              {`Powered by run pipeline (/agents/${
                selectedAgentId || "id"
              }/run + /runs/{${currentRunId || "id"}}/events)`}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-2 text-[13px]">
          {chatItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-muted_fg">
              Start a conversation by sending a message below.
            </div>
          ) : (
            chatItems.map((m, idx) => {
              const isUser = m.role === "user";
              const isTool = m.role === "tool";
              const bubbleClass = isUser
                ? "bg-accent text-accent_fg"
                : isTool
                  ? "bg-muted border border-border"
                  : m.kind === "error"
                    ? "bg-red-500/10 border border-red-500/30 text-red-200"
                    : "bg-panel";

              return (
                <div
                  key={idx}
                  className={[
                    "flex w-full",
                    isUser ? "justify-end" : "justify-start",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "max-w-[75%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                      bubbleClass,
                    ].join(" ")}
                  >
                    {isTool && (
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted_fg">
                        tool
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          className="border-t border-border px-4 py-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedAgentId ? "Type a message…" : "Select an agent first…"
            }
            disabled={!selectedAgentId || sending}
          />
          <Button type="submit" disabled={!selectedAgentId || sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
