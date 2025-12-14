/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  listAgents,
  startAgentRun,
  streamRun,
  type AgentListItem,
  type RunEvent,
} from "@/services/job6";

/**
 * Vibe: simple chat surface for interacting with agents.
 *
 * - Left: list of agents
 * - Right: chat transcript powered by Job 6 run pipeline + SSE
 */
export default function VibePage() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
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
      const items = await listAgents(1, 50);
      setAgents(items);
      if (!selectedAgentId && items.length > 0) {
        setSelectedAgentId(items[0].id);
      }
    } catch (err: any) {
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

    // Add the user message to the transcript
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
      const { runId } = await startAgentRun(selectedAgentId, {
        input: text,
        source: "vibe",
        config: { surface: "vibe" },
      });
      setCurrentRunId(runId);

      // Wrap SSE handler so we can auto-stop on done/error
      const stop = streamRun(runId, (evt) => {
        setEvents((prev) => [...prev, evt]);
        if (evt.type === "done" || evt.type === "error") {
          stop();
        }
      });
    } catch (err: any) {
      console.error("Failed to start run", err);
      toast.error(err?.message ?? "Failed to start run");
    } finally {
      setSending(false);
    }
  }

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
              No agents yet. Create one from Flow or the API, then come back
              here.
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {agents.map((agent) => {
                const active = agent.id === selectedAgentId;
                return (
                  <li key={agent.id}>
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
              {`Powered by Job 6 run pipeline (/agents/{${
                currentRunId || "id"
              }}/run + /runs/{${currentRunId || "id"}}/events)`}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-2 text-[13px]">
          {events.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-[hsl(var(--muted-fg))]">
              Start a conversation by sending a message below.
            </div>
          ) : (
            events.map((e, idx) => {
              const role =
                e.payload?.role ??
                (e.type === "token"
                  ? "assistant"
                  : e.type === "log"
                  ? "user"
                  : e.type);
              const text =
                e.message ??
                e.payload?.text ??
                (typeof e.payload === "string" ? e.payload : undefined);
              if (!text) return null;
              const isUser = role === "user";
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
                      "max-w-[70%] rounded-2xl px-3 py-2 text-[13px]",
                      isUser
                        ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))]"
                        : "bg-[hsl(var(--panel))]",
                    ].join(" ")}
                  >
                    {text}
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
              selectedAgentId
                ? "Ask the agent anything…"
                : "Select an agent to begin"
            }
            disabled={sending || !selectedAgentId}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || !selectedAgentId}>
            {sending ? "Running…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
