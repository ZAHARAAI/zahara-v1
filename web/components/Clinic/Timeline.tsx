/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useEventBus } from "@/hooks/useEventBus";
import {
  exportSession,
  getSessionByRequestId,
  listSessions,
  replaySession,
  startRun,
  streamRun,
  type RunEvent,
  type SessionSummary,
} from "@/services/api";

export default function Timeline() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const { runId, events, setRunId, pushEvent, clearEvents } = useEventBus();
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

    return () => {
      stopRef.current?.();
    };
  }, []);

  const openSession = async (requestId: string) => {
    try {
      setSelectedId(requestId);
      clearEvents();

      const json = await getSessionByRequestId(requestId);

      json.session.events.forEach(
        (ev: { type: string; payload: any; ts?: string }) => {
          const { type, payload, ts } = ev;

          if (type === "metric") {
            pushEvent({
              type: "metric",
              ts,
              tokens: payload.tokens,
              cost: payload.cost,
              duration: payload.latency_ms ?? payload.latencyMs,
              payload,
            } as RunEvent);
          } else if (type === "log") {
            pushEvent({
              type: "log",
              ts,
              level: payload.level ?? "info",
              message: payload.message,
              payload,
            } as RunEvent);
          } else if (type === "status") {
            pushEvent({
              type: "status",
              ts,
              status: payload.status,
              message: payload.status,
              payload,
            } as RunEvent);
          } else if (
            type === "heartbeat" ||
            type === "done" ||
            type === "error"
          ) {
            pushEvent({
              type: type as RunEvent["type"],
              ts,
              message: payload.message ?? payload.status,
              error: payload.error,
              payload,
            } as RunEvent);
          } else {
            // Fallback: still show unknown event shapes in the timeline
            pushEvent({
              type: "log",
              ts,
              level: "warn",
              message: `Unknown event type "${type}" from session; see payload`,
              payload: { type, ...payload },
            } as RunEvent);
          }
        }
      );
    } catch (e: any) {
      toast.error("Failed to load session", { description: e.message });
    }
  };

  const handleSseEvent = (evt: RunEvent) => {
    if (!evt || typeof evt.type !== "string") return;

    if (evt.type === "metric") {
      const payload = evt.payload ?? {};
      pushEvent({
        ...evt,
        tokens: payload.tokens ?? (evt as any).tokens,
        cost: payload.cost ?? (evt as any).cost,
        duration:
          payload.latency_ms ??
          payload.latencyMs ??
          (evt as any).latency_ms ??
          (evt as any).latencyMs,
      } as RunEvent);
    } else if (evt.type === "log") {
      pushEvent({
        ...evt,
        level: evt.level ?? evt.payload?.level ?? "info",
        message: evt.message ?? evt.payload?.message,
      } as RunEvent);
    } else if (
      evt.type === "status" ||
      evt.type === "done" ||
      evt.type === "heartbeat"
    ) {
      pushEvent({
        ...evt,
        message: evt.message ?? evt.status ?? evt.payload?.status,
      } as RunEvent);
    } else if (evt.type === "error") {
      pushEvent({
        ...evt,
        level: evt.level ?? "error",
        message: evt.message ?? evt.error ?? evt.payload?.message,
      } as RunEvent);
    } else {
      // Unknown type – this should already be filtered by streamRun, but
      // keeping a fallback here makes the UI more robust.
      pushEvent(evt);
    }
  };

  const attachLive = (id: string) => {
    try {
      stopRef.current?.();
      setRunId(id);
      stopRef.current = streamRun(id, handleSseEvent);
      toast.success("Attached to run", { description: id });
    } catch (e: any) {
      toast.error("Failed to attach", { description: e.message });
    }
  };

  const runQuickTest = async () => {
    try {
      const res = await startRun({
        source: "clinic",
        payload: { prompt: "Quick health check" },
        model: "gpt-4",
        metadata: { surface: "clinic", mode: "quick-test" },
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

      clearEvents();
      setRunId(res.runId);
      stopRef.current?.();
      stopRef.current = streamRun(res.runId, handleSseEvent);
    } catch (e: any) {
      toast.error("Replay failed", { description: e.message });
    }
  };

  const exportJson = async () => {
    if (!selectedId) return;
    try {
      const res = await exportSession(selectedId);
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
    <div className="flex h-full">
      {/* Left: session list */}
      <div className="w-80 border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20">
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
        <ul className="max-h-[calc(100vh-80px)] overflow-auto text-xs">
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

      {/* Right: timeline view */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-xs">
          <span className="font-medium">Timeline</span>
          {runId && (
            <span className="text-[11px] opacity-70">
              Live run: <span className="font-mono">{runId}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Input
              className="h-7 w-40 text-xs"
              placeholder="Attach run ID…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value) attachLive(value);
                }
              }}
            />
            <Select
              label=""
              options={[
                ["all", "All events"],
                ["log", "Logs only"],
                ["metric", "Metrics only"],
              ]}
              value="all"
              onChange={() => {}}
            />
            <Button
              size="xs"
              variant="primary"
              className="hover:bg-green-700"
              type="button"
              onClick={replay}
              disabled={!selectedId}
            >
              Replay
            </Button>
            <Button
              size="xs"
              variant="ghost"
              type="button"
              onClick={exportJson}
              disabled={!selectedId}
            >
              Export JSON
            </Button>
          </div>
        </div>

        <ul className="flex-1 space-y-1.5 overflow-auto p-3 text-xs">
          {events.map((e, idx) => (
            <li
              key={`${idx}-${e.type}-${e.ts ?? "no-ts"}`}
              className="rounded border border-[hsl(var(--border))] bg-background/80 px-3 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase opacity-70">
                  {e.type}
                </span>
                {"duration" in e && (e as any).duration !== undefined && (
                  <span className="text-[10px] opacity-60">
                    {(e as any).duration} ms
                  </span>
                )}
              </div>
              {"message" in e && e.message && (
                <div className="mt-0.5 text-[11px] opacity-80">{e.message}</div>
              )}
              {"tokens" in e && (e as any).tokens !== undefined && (
                <div className="mt-0.5 text-[10px] opacity-60">
                  Tokens: {(e as any).tokens}{" "}
                  {"cost" in e ? `(cost: ${(e as any).cost})` : ""}
                </div>
              )}
            </li>
          ))}
          {events.length === 0 && (
            <li className="p-2 text-xs opacity-60">
              Select a session to inspect its timeline.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
