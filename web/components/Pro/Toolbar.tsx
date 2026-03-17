"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { useEventBus } from "@/hooks/useEventBus";
import { useProStore } from "@/hooks/useProStore";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import { useBuildersStore } from "@/hooks/useBuildersStore";
import {
  startAgentRun,
  streamRun,
  cancelRun,
  type RunEvent,
} from "@/services/api";
import { Button } from "@/components/ui/Button";

type RunButtonState = "idle" | "running" | "success" | "error";

const Toolbar = () => {
  const router = useRouter();
  const { selectedPath, content, agentId } = useProStore();
  const runUI = useRunUIStore();
  const { setRunId, pushEvent, clearEvents } = useEventBus();

  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunButtonState>("idle");
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
          "No agent bound. Open Pro from a Flow that was saved as an Agent.",
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
    setRunState("running");

    runUI.show("BUILD", "Running via Pro…", { autoCloseMs: 1500 });

    try {
      const res = await startAgentRun(agentId, {
        input: content,
        source: "pro",
        config: { path: selectedPath, surface: "pro" },
      });

      if (res?.budget?.percent_used && res?.budget?.percent_used >= 80) {
        toast.warning(`Budget ${res.budget.percent_used.toFixed(0)}% used`);
      }

      const run_id = res.run_id;

      setRunId?.(run_id);
      setLastRunId(run_id);
      currentRunIdRef.current = run_id;

      // Sync to BuildersStore
      useBuildersStore.getState().setActiveRun({
        runId: run_id,
        status: "running",
        startedAt: Date.now(),
        source: "pro",
      });
      useBuildersStore.getState().setSelectedRunId(run_id);

      stopRef.current?.();
      stopRef.current = streamRun(
        run_id,
        (event) => {
          emitLocal(event);
          if (event.type === "done") {
            setRunState("success");
            setRunning(false);
            useBuildersStore.getState().clearActiveRun();
            toast.success("Pro run completed!", {
              duration: 8000,
              action: {
                label: "View in Clinic →",
                onClick: () =>
                  router.push(`/clinic?runId=${encodeURIComponent(run_id)}`),
              },
            });
            setTimeout(() => setRunState("idle"), 3000);
          }
          if (event.type === "error") {
            setRunState("error");
            setRunning(false);
            useBuildersStore
              .getState()
              .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
            setTimeout(() => setRunState("idle"), 4000);
          }
        },
        { autoCloseMs: 1500, fadeMs: 180 },
      );
    } catch (err) {
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message: "Failed to start run. Check console / network tab.",
      });
      runUI.setError("Failed to start run.");
      setRunState("error");
      useBuildersStore
        .getState()
        .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
      setTimeout(() => setRunState("idle"), 4000);
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
    <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted_fg">
          Pro IDE
        </span>
        <span className="text-[12px] font-mono">
          {selectedPath ?? "No file selected"}
        </span>
        {agentId && (
          <span className="text-[11px] text-muted_fg">
            Agent: <code className="font-mono">{agentId}</code>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {lastRunId && (
          <span className="text-[11px] text-muted_fg">
            Last run: <code className="font-mono">{lastRunId}</code>
          </span>
        )}

        <Button size="xs" variant="outline">
          <Sparkles className="h-3 w-3" />
          <span className="ml-1">AG-UI</span>
        </Button>

        {running ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => void handleCancel()}
            className="gap-1.5"
          >
            <X className="h-3 w-3" />
            Cancel
          </Button>
        ) : runState === "success" ? (
          <Button
            size="xs"
            variant="outline"
            disabled
            className="gap-1.5 border-emerald-500/40 text-emerald-400"
          >
            <CheckCircle2 className="h-3 w-3" />
            Done ✓
          </Button>
        ) : runState === "error" ? (
          <Button
            size="xs"
            variant="outline"
            onClick={handleRun}
            className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <XCircle className="h-3 w-3" />
            Retry
          </Button>
        ) : (
          <Button
            size="xs"
            onClick={handleRun}
            disabled={!selectedPath}
            className="gap-1.5"
          >
            <Play className="h-3 w-3" />
            Run
          </Button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
