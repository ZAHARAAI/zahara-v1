/* eslint-disable @typescript-eslint/no-explicit-any */
// components/Clinic/Timeline.tsx

"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useEventBus } from "@/hooks/useEventBus";
import {
  getSessionByRequestId,
  listSessions,
  replaySession,
  startRun,
  streamRun,
  type SessionSummary,
} from "@/services/api";

export default function Timeline() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const { runId, events, setRun, push, clear } = useEventBus();
  const stopRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const list = await listSessions();
        setSessions(list);
      } catch (e: any) {
        toast.error("Failed to load sessions", { description: e.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openSession = async (requestId: string) => {
    try {
      setSelectedId(requestId);
      clear();

      const json = await getSessionByRequestId(requestId);
      json.session.events.forEach((ev: any) => {
        const type = ev.type;
        const payload = ev.payload ?? {};
        if (type === "metric") {
          push({
            type: "metric",
            tokens: payload.tokens,
            cost: payload.cost,
            duration: payload.latency_ms,
          });
        } else if (type === "log") {
          push({
            type: "log",
            level: payload.level ?? "info",
            message: payload.message,
          });
        } else if (type === "status") {
          push({ type: "status", message: payload.status });
        } else {
          push({ type, ...payload });
        }
      });
    } catch (e: any) {
      toast.error("Failed to load session", { description: e.message });
    }
  };

  const attachLive = (id: string) => {
    try {
      stopRef.current?.();
      setRun(id);
      stopRef.current = streamRun(id, (data: any, type?: string) => {
        if (type === "metric") {
          push({
            type: "metric",
            tokens: data?.payload?.tokens,
            cost: data?.payload?.cost,
            duration: data?.payload?.latency_ms,
          });
        } else if (type === "log") {
          push({
            type: "log",
            level: data?.payload?.level ?? "info",
            message: data?.payload?.message,
          });
        } else if (type === "status") {
          push({ type: "status", message: data?.payload?.status });
        } else if (type === "done") {
          push({ type: "status", message: "done" });
        } else {
          push(data);
        }
      });
      toast.success("Attached to run", { description: id });
    } catch (e: any) {
      toast.error("Failed to attach", { description: e.message });
    }
  };

  const runQuickTest = async () => {
    try {
      const res = await startRun({
        source: "clinic",
        model: "gpt-4",
        prompt: "Quick health check",
      });
      attachLive(res.runId);
    } catch (e: any) {
      toast.error("Quick run failed", { description: e.message });
    }
  };

  const replay = async () => {
    if (!selectedId) return;
    try {
      const res = await replaySession(selectedId);
      toast.success("Replay started", { description: res.runId });

      // clear old events & attach to new run
      clear();
      setRun(res.runId);
      stopRef.current?.();
      stopRef.current = streamRun(res.runId, (data: any, type?: string) => {
        if (type === "metric") {
          push({
            type: "metric",
            tokens: data?.payload?.tokens,
            cost: data?.payload?.cost,
            duration: data?.payload?.latency_ms,
          });
        } else if (type === "log") {
          push({
            type: "log",
            level: data?.payload?.level ?? "info",
            message: data?.payload?.message,
          });
        } else if (type === "status") {
          push({ type: "status", message: data?.payload?.status });
        } else if (type === "done") {
          push({ type: "status", message: "done" });
        } else {
          push(data);
        }
      });
    } catch (e: any) {
      toast.error("Replay failed", { description: e.message });
    }
  };

  const exportJson = async () => {
    if (!selectedId) return;
    try {
      const res = await getSessionByRequestId(selectedId); // you already import this
      const blob = new Blob([JSON.stringify(res.session, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${selectedId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Export failed", { description: e.message });
    }
  };

  return (
    <div className="flex h-full bg-[hsl(var(--panel))]">
      <div className="w-80 border-r border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-xs">
          <span className="font-medium">Sessions</span>
          <Button
            className="ml-auto"
            size="xs"
            variant="secondary"
            onClick={runQuickTest}
          >
            Quick run
          </Button>
        </div>
        {loading && (
          <div className="p-3 text-xs opacity-70">Loading sessions…</div>
        )}
        <ul className="max-h-full overflow-auto text-xs">
          {sessions.map((s) => (
            <li
              key={s.requestId}
              className={`cursor-pointer px-3 py-2 hover:bg-[hsl(var(--muted))] ${
                s.requestId === selectedId ? "bg-[hsl(var(--muted))]" : ""
              }`}
              onClick={() => openSession(s.requestId)}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{s.requestId}</span>
                <span className="text-[10px] uppercase opacity-60">
                  {s.status}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] opacity-60">
                {s.model} · {s.tokens ?? "?"} tok · {s.latencyMs ?? "?"}ms
              </div>
            </li>
          ))}
          {!loading && sessions.length === 0 && (
            <li className="px-3 py-2 text-xs opacity-60">
              No sessions yet. Run something from Pro.
            </li>
          )}
        </ul>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-xs">
          <span className="font-medium">Timeline</span>
          <Input
            className="ml-auto max-w-xs"
            placeholder="Filter (not wired yet)"
          />
          <Select
            label=""
            options={[
              ["all", "All events"],
              ["status", "Status only"],
              ["log", "Logs only"],
              ["metric", "Metrics only"],
            ]}
            value="all"
            onChange={() => {}}
          />
          <Button
            size="xs"
            variant="secondary"
            disabled={!selectedId}
            onClick={replay}
          >
            Replay
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={!selectedId}
            onClick={exportJson}
          >
            Export JSON
          </Button>
          {runId && (
            <span className="text-[10px] opacity-60">live run: {runId}</span>
          )}
        </div>
        <ul className="max-h-full space-y-2 overflow-auto p-3 text-xs">
          {events.map((e, i) => (
            <li
              key={i}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg))] p-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase opacity-60">
                  {e.type}
                </span>
                {"duration" in e && e.duration !== undefined && (
                  <span className="text-[10px] opacity-60">
                    {e.duration} ms
                  </span>
                )}
              </div>
              {"message" in e && e.message && (
                <div className="mt-1">{e.message}</div>
              )}
              {"tokens" in e && (
                <div className="mt-1 text-[11px] opacity-80">
                  Tokens: {e.tokens} {"cost" in e ? `(cost: ${e.cost})` : ""}
                </div>
              )}
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-xs opacity-60 p-2">
              Select a session to inspect its timeline.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
