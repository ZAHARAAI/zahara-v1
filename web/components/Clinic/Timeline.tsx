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
  listSessions,
  replaySession,
  startRun,
  streamRun,
} from "@/services/api";

const DEFAULT_ENTRY = "agents/hello.ts";

type SessionItem = {
  id: string;
  flowId?: string;
  status: string;
  startedAt: string;
  durationMs?: number;
};

export default function Timeline() {
  const { events, clear, setRun, runId, push } = useEventBus();

  // Live attach state
  const [localRunId, setLocalRunId] = useState<string>("");

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  // SSE cleanup handle
  const stopRef = useRef<() => void>(() => {});

  // Cleanup SSE on unmount
  useEffect(() => () => stopRef.current?.(), []);

  // Load sessions on mount
  useEffect(() => {
    const load = async () => {
      setLoadingSessions(true);
      try {
        const { sessions } = await listSessions();
        setSessions(sessions);
      } catch (e: any) {
        toast.error("Failed to load sessions", { description: e.message });
      } finally {
        setLoadingSessions(false);
      }
    };
    load();
  }, []);

  // Attach to live SSE stream for a given runId
  const attach = (id: string) => {
    try {
      stopRef.current?.();
      setRun(id);
      stopRef.current = streamRun(id, (data: any, type?: string) =>
        // ensure event.type is set for rendering
        push(type ? { type, ...data } : data)
      );
      toast.success("Attached to run", { description: id });
    } catch (error) {
      toast.error("Failed to attach to run", {
        description: (error as Error).message,
      });
    }
  };

  // Replay currently attached run into a NEW run (SSE live view)
  const replay = async () => {
    if (!runId) return;
    try {
      const start = await startRun(DEFAULT_ENTRY, { replay: runId });
      attach(start.runId);
    } catch (error) {
      toast.error("Failed to replay run", {
        description: (error as Error).message,
      });
    }
  };

  // Load the historical events of a past session (no SSE)
  const loadSession = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const { events } = await replaySession(sessionId);
      // Clear current buffer and display historical events
      stopRef.current?.();
      clear();
      setRun(`session:${sessionId}`);
      for (const ev of events) {
        // tag as historical if no type
        push(ev?.type ? ev : { type: "replay", ...ev });
      }
      toast.success("Session loaded", { description: sessionId });
    } catch (e: any) {
      toast.error("Failed to load session", { description: e.message });
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId || "current"}-events.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const options: [string, string][] = sessions.map((s) => [
    s.id,
    `${s.id.slice(0, 8)} • ${s.status} • ${new Date(
      s.startedAt
    ).toLocaleString()}`,
  ]);

  // Build options for Select
  const sessionOptions: [string, string][] = [
    ["", loadingSessions ? "Loading sessions…" : "Load session…"],
    ...options,
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-[hsl(var(--border))]">
        {/* Live attach by runId */}
        <Input
          style={{ width: 260 }}
          placeholder="Enter runId…"
          value={localRunId}
          onChange={(e) => setLocalRunId(e.target.value)}
        />
        <Button onClick={() => localRunId && attach(localRunId)}>Attach</Button>

        {/* Replay currently attached run into a new run */}
        <Button variant="secondary" onClick={replay} disabled={!runId}>
          Replay
        </Button>

        {/* Load historical session (no SSE; fetched events) */}
        <Select
          value={selectedSessionId}
          onChange={(id) => {
            setSelectedSessionId(id);
            if (id) loadSession(id);
          }}
          options={sessionOptions}
        />

        <Button
          variant="outline"
          onClick={() => {
            setSelectedSessionId("");
            (async () => {
              setLoadingSessions(true);
              try {
                const { sessions } = await listSessions();
                setSessions(sessions);
                toast.success("Sessions refreshed");
              } catch (e: any) {
                toast.error("Failed to refresh sessions", {
                  description: e.message,
                });
              } finally {
                setLoadingSessions(false);
              }
            })();
          }}
        >
          Refresh
        </Button>

        <Button variant="ghost" onClick={exportJSON}>
          Export JSON
        </Button>

        <div className="ml-auto text-xs opacity-70">
          Events: {events.length}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {events.length === 0 && (
          <div className="opacity-60 text-sm">No events yet.</div>
        )}
        <ul className="space-y-2">
          {events.map((e, idx) => (
            <li
              key={idx}
              className="rounded-xl border border-[hsl(var(--border))] p-3"
            >
              <div className="text-xs uppercase opacity-70">
                {e.type || "event"}
              </div>
              {"message" in e && <div className="text-sm">{e.message}</div>}
              {"step" in e && <div className="text-sm">Step: {e.step}</div>}
              {"duration" in e && (
                <div className="text-sm">Duration: {e.duration}ms</div>
              )}
              {"tokens" in e && (
                <div className="text-sm">
                  Tokens: {e.tokens} {"cost" in e ? `(cost: ${e.cost})` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
