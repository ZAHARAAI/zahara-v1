"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";

import { useEventBus } from "@/hooks/useEventBus";
import { useProStore } from "@/hooks/useProStore";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import { startAgentRun, streamRun, type RunEvent } from "@/services/api";
import { Button } from "@/components/ui/Button";

const Toolbar = () => {
  const { selectedPath, content, agentId } = useProStore();
  const { show, hide } = useRunUIStore();
  const { setRunId, pushEvent, clearEvents } = useEventBus();

  const [running, setRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const stopRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  function emitLocal(event: RunEvent) {
    pushEvent(event);
  }

  async function handleRun() {
    if (!agentId) {
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message:
          "No agent bound to this Pro session. Open Pro from a Flow that was saved as an Agent.",
      });
      return;
    }
    if (!content) {
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message: "Current file has no content to run.",
      });
      return;
    }

    clearEvents?.();
    setRunning(true);
    show("BUILD", "Running via Job 6 router…");

    try {
      const { run_id } = await startAgentRun(agentId, {
        input: content,
        source: "pro",
        config: {
          path: selectedPath,
          surface: "pro",
        },
      });

      setRunId?.(run_id);
      setLastRunId(run_id);

      stopRef.current?.();
      stopRef.current = streamRun(run_id, (event) => {
        emitLocal(event);
      });
    } catch (err) {
      console.error("Failed to start agent run from Pro", err);
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message:
          "Failed to start run via Job 6 pipeline. Check console / network tab.",
      });
    } finally {
      hide();
      setRunning(false);
      hide();
    }
  }

  // TODO: handleCancel has not been used
  function handleCancel() {
    if (!running) return;
    stopRef.current?.();
    emitLocal({
      type: "log",
      ts: new Date().toISOString(),
      message: "Run cancelled from Pro toolbar.",
    });
    setRunning(false);
    hide();
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted-fg))]">
            Pro IDE
          </span>
          <span className="text-[12px] font-mono">
            {selectedPath ?? "No file selected"}
          </span>
          {agentId && (
            <span className="text-[11px] text-[hsl(var(--muted-fg))]">
              Agent: <code className="font-mono">{agentId}</code>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastRunId && (
            <span className="text-[11px] text-[hsl(var(--muted-fg))]">
              Last run: <code className="font-mono">{lastRunId}</code>
            </span>
          )}

          <Button size="xs" variant="outline">
            <Sparkles className="h-3 w-3" />
            <span className="ml-1">AG-UI</span>
          </Button>

          <Button
            size="xs"
            onClick={handleRun}
            disabled={running || !selectedPath}
          >
            {running ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="ml-1">Running…</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                <span className="ml-1">Run</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
};

export default Toolbar;
