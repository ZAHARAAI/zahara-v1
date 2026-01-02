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
} from "@/services/api";
import { Trash2Icon } from "lucide-react";

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

/**
 * Vibe: simple chat surface for interacting with agents.
 *
 * - Left: list of agents
 * - Right: chat transcript powered by Job 6 run pipeline + SSE
 */
export default function VibePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const { show, hide } = useRunUIStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [events, setEvents] = useState<RunEvent[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  useEffect(() => {
    void loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAgents() {
    try {
      const items = await listAgents();
      setAgents(items);
      if (!selectedAgentId && items.length > 0) {
        setSelectedAgentId(items[0].id);
      }
    } catch (err: any) {
      hide();
      console.error("Failed to load agents", err);
      toast.error(err?.message ?? "Failed to load agents");
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

    setSending(true);
    setInput("");

    // Add user message as an event (so we render it consistently)
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
          if (evt.type === "done" || evt.type === "error") {
            hide();
            stop();
          }
        },
        { autoCloseMs: 700 }
      );
    } catch (err: any) {
      hide();
      console.error("Failed to start run", err);
      toast.error(err?.message ?? "Failed to start run");
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
      // console.error("Failed to delete agent ", err);
      toast.error(err?.message ?? "Failed to delete agent");
    }
  }

  // Convert raw events -> chat items (aggregates tokens)
  const chatItems: ChatItem[] = useMemo(() => {
    const out: ChatItem[] = [];

    for (const e of events) {
      if (e.type === "ping" || e.type === "done") continue;

      // Explicit error bubble
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

      // Tool events
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

      // Token events → append to last assistant bubble
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

      // Log events: treat payload.role=user as user message
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

      // System fallback
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
    <div className="flex h-[calc(100vh-4rem)] rounded-2xl border border-[hsl(var(--border))] overflow-hidden">
      {/* Agents list */}
      <div className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--panel))] flex flex-col">
        <div className="px-3 py-2 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <span className="text-[13px] font-medium">Agents</span>
          <Button size="xs" variant="outline" onClick={() => void loadAgents()}>
            Reload
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {agents.length === 0 ? (
            <div className="p-3 text-[12px] text-[hsl(var(--muted-fg))]">
              No agents yet. Create one from Flow or the Pro API, then come back
              here.
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {agents.map((agent, idx) => {
                const active = agent.id === selectedAgentId;
                return (
                  <li
                    key={agent.id}
                    className="flex justify-between items-center gap-x-1"
                  >
                    <button
                      type="button"
                      className={[
                        "w-full px-3 py-2 text-left text-[12px] hover:bg-[hsl(var(--muted))]",
                        active ? "bg-[hsl(var(--muted))]" : "",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        resetTranscript();
                      }}
                    >
                      <div className="font-medium truncate">{agent.name}</div>
                      <div className="text-[11px] text-[hsl(var(--muted-fg))] truncate">
                        {agent.description ?? agent.slug}
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        handleDeleteAgent(agent.id, idx);
                      }}
                    >
                      <Trash2Icon className="h-4 w-4 text-red-300 hover:text-red-400 " />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Chat surface */}
      <div className="flex-1 flex flex-col bg-[hsl(var(--bg))]">
        <div className="border-b border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[13px] font-medium">
              {selectedAgentId
                ? `Chat with agent ${selectedAgentId}`
                : "Select an agent to start chatting"}
            </div>
            <div className="text-[11px] text-[hsl(var(--muted-fg))]">
              {`Powered by run pipeline (/agents/${
                selectedAgentId || "id"
              }/run + /runs/{${currentRunId || "id"}}/events)`}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-2 text-[13px]">
          {chatItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-[hsl(var(--muted-fg))]">
              Start a conversation by sending a message below.
            </div>
          ) : (
            chatItems.map((m, idx) => {
              const isUser = m.role === "user";
              const isTool = m.role === "tool";
              const bubbleClass = isUser
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))]"
                : isTool
                ? "bg-[hsl(var(--muted))] border border-[hsl(var(--border))]"
                : m.kind === "error"
                ? "bg-red-500/10 border border-red-500/30 text-red-200"
                : "bg-[hsl(var(--panel))]";

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
                      "max-w-[75%] rounded-2xl px-3 py-2 text-[13px]",
                      bubbleClass,
                    ].join(" ")}
                  >
                    {isTool && (
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-fg))]">
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
          className="border-t border-[hsl(var(--border))] px-4 py-3 flex items-center gap-2"
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
