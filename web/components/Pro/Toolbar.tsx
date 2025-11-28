"use client";

import { useEventBus } from "@/hooks/useEventBus";
import { useProStore } from "@/hooks/useProStore";
import { startRun, streamRun, type RunEvent } from "@/services/api";
import { Loader2, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";

const Toolbar = () => {
  const { selectedPath, content } = useProStore();

  const { setRunId, pushEvent, clearEvents } = useEventBus();

  const [running, setRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const stopRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    // Cleanup SSE on unmount or route change
    return () => {
      stopRef.current?.();
    };
  }, []);

  async function handleRun() {
    if (!selectedPath) return;

    setRunning(true);
    clearEvents();

    try {
      const { runId, requestId } = await startRun({
        source: "pro_ide",
        payload: {
          path: selectedPath,
          content,
        },
        metadata: {
          surface: "pro",
        },
      });

      setRunId(runId);
      setLastRunId(runId);

      const stop = streamRun(runId, (evt: RunEvent) => {
        // Ignore events without a type for safety
        if (!evt || typeof evt.type !== "string") return;

        // If you want to hide heartbeats, uncomment this:
        // if (evt.type === "heartbeat") return;

        pushEvent(evt);
      });

      stopRef.current = stop;

      // Seed a synthetic event for UX
      pushEvent({
        type: "status",
        ts: new Date().toISOString(),
        runId,
        requestId,
        status: "started",
        message: "Run started from Pro IDE",
      });
    } catch (err) {
      console.error("Failed to start run", err);
      pushEvent({
        type: "error",
        ts: new Date().toISOString(),
        message: "Failed to start run. Check console / network tab.",
        level: "error",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span className="font-medium">Pro IDE</span>
        {selectedPath && (
          <span className="text-[11px] text-muted-foreground">
            editing <span className="font-mono">{selectedPath}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {lastRunId && (
          <span className="text-[11px] text-muted-foreground">
            Last run: <span className="font-mono">{lastRunId}</span>
          </span>
        )}

        <Button
          type="button"
          onClick={handleRun}
          disabled={!selectedPath || running}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium hover:bg-accent hover:text-accent-foreground ${
            !selectedPath || running
              ? "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground"
              : ""
          }`}
        >
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Run
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Toolbar;
