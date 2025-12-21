// web/components/Pro/Toolbar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Sparkles, X } from "lucide-react";

import { useEventBus } from "@/hooks/useEventBus";
import { useProStore } from "@/hooks/useProStore";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import {
  startAgentRun,
  streamRun,
  cancelRun,
  type RunEvent,
} from "@/services/api";
import { Button } from "@/components/ui/Button";

const Toolbar = () => {
  const { selectedPath, content, agentId } = useProStore();
  const runUI = useRunUIStore();
  const { setRunId, pushEvent, clearEvents } = useEventBus();

  const [running, setRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);

  const stopRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  function emitLocal(event: RunEvent) {
    pushEvent(event);
  }

  function isTypingTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  // Keyboard shortcuts: Ctrl+C / Cmd+.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!running) return;
      if (isTypingTarget(e.target)) return;

      const isCtrlC = e.ctrlKey && (e.key === "c" || e.key === "C");
      const isCmdDot = e.metaKey && e.key === ".";

      if (isCtrlC || isCmdDot) {
        e.preventDefault();
        void handleCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

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

    runUI.show("BUILD", "Running via Job 6 router…", { autoCloseMs: 1500 });

    try {
      const { run_id } = await startAgentRun(agentId, {
        input: content,
        source: "pro",
        config: { path: selectedPath, surface: "pro" },
      });

      setRunId?.(run_id);
      setLastRunId(run_id);
      currentRunIdRef.current = run_id;

      stopRef.current?.();
      stopRef.current = streamRun(run_id, (event) => emitLocal(event), {
        autoCloseMs: 1500,
        fadeMs: 180,
      });
    } catch (err) {
      console.error("Failed to start agent run from Pro", err);
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message:
          "Failed to start run via Job 6 pipeline. Check console / network tab.",
      });
      runUI.setError("Failed to start run.");
    } finally {
      setRunning(false);
    }
  }

  async function handleCancel() {
    if (!running) return;

    const rid = currentRunIdRef.current;

    // stop SSE immediately for UX
    stopRef.current?.();
    stopRef.current = null;

    emitLocal({
      type: "log",
      ts: new Date().toISOString(),
      message: "Cancelling run…",
    });

    try {
      if (rid) {
        await cancelRun(rid);
      }

      emitLocal({
        type: "cancelled",
        ts: new Date().toISOString(),
        message: "Cancelled by user",
      });

      // modal state (cancelled)
      runUI.setPhase("done", "Cancelled");
      runUI.safeHideAfter(800, runUI.sessionId, 180);
    } catch (err) {
      console.error("Cancel failed", err);
      runUI.setError("Failed to cancel run.");
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message: "Failed to cancel run.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
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

        {!running ? (
          <Button size="xs" onClick={handleRun} disabled={!selectedPath}>
            <Play className="h-3 w-3" />
            <span className="ml-1">Run</span>
          </Button>
        ) : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => void handleCancel()}
          >
            <X className="h-3 w-3" />
            <span className="ml-1">Cancel</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
