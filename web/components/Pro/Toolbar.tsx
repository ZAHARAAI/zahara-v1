"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  AlertTriangle,
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

// Warning fix: if SSE connects but the backend never sends a terminal event
// (network drops mid-stream), without this guard the Cancel button stays
// visible forever and the modal never closes.
const STREAM_STALL_TIMEOUT_MS = 90_000;

const Toolbar = () => {
  const router = useRouter();
  const { selectedPath, content, agentId } = useProStore();
  const { setRunId, pushEvent, clearEvents } = useEventBus();

  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunButtonState>("idle");
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stream stall guard — fires if no terminal event arrives within 90s
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    };
  }, []);

  function clearStreamTimeout() {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }

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
    if (!agentId || !content) return;

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    clearStreamTimeout();

    clearEvents?.();
    setRunning(true);
    setRunState("running");

    useRunUIStore.getState().show("BUILD", "Running via Pro…", {
      autoCloseMs: 1500,
    });

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

      useBuildersStore.getState().setActiveRun({
        runId: run_id,
        status: "running",
        startedAt: Date.now(),
        source: "pro",
      });
      useBuildersStore.getState().setSelectedRunId(run_id);

      // Start stream stall guard — clears when a terminal event arrives
      streamTimeoutRef.current = setTimeout(() => {
        streamTimeoutRef.current = null;
        // Only fire if still running (not already cancelled or finished)
        if (!useRunStore_running()) return;

        stopRef.current?.();
        stopRef.current = null;

        setRunState("error");
        setRunning(false);
        useBuildersStore
          .getState()
          .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
        useRunUIStore
          .getState()
          .setError("Stream timed out — no response from agent after 90s.");
        setTimeout(() => setRunState("idle"), 4000);
        toast.error("Run timed out — no response after 90s");
      }, STREAM_STALL_TIMEOUT_MS);

      stopRef.current?.();
      stopRef.current = streamRun(
        run_id,
        (event) => {
          emitLocal(event);

          if (event.type === "done") {
            clearStreamTimeout();
            setRunState("success");
            setRunning(false);
            stopRef.current?.();
            stopRef.current = null;
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
            clearStreamTimeout();
            const msg =
              (typeof event.message === "string" && event.message) ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (typeof (event.payload as any)?.message === "string" &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (event.payload as any).message) ||
              "Run failed";
            setRunState("error");
            setRunning(false);
            stopRef.current?.();
            stopRef.current = null;
            useBuildersStore
              .getState()
              .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
            setTimeout(() => setRunState("idle"), 4000);
          }
        },
        { autoCloseMs: 1500, fadeMs: 180 },
      );
    } catch (err) {
      clearStreamTimeout();
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message: "Failed to start run. Check console / network tab.",
      });
      useRunUIStore.getState().setError("Failed to start run.");
      setRunState("error");
      setRunning(false);
      useBuildersStore
        .getState()
        .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
      setTimeout(() => setRunState("idle"), 4000);
    } finally {
      setRunning(false);
      useRunUIStore.getState().hide();
    }
  }

  // Helper: read running state from outside React without stale closure.
  // Used by the stream timeout callback which can't close over `running`.
  function useRunStore_running(): boolean {
    // We use the Toolbar's own running state via a ref trick — the timeout
    // callback checks the ref, not the stale closure.
    return runningRef.current;
  }

  async function handleCancel() {
    if (!running) return;

    const rid = currentRunIdRef.current;

    stopRef.current?.();
    stopRef.current = null;
    clearStreamTimeout();

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    emitLocal({
      type: "log",
      ts: new Date().toISOString(),
      message: "Cancelling run…",
    });

    setRunning(false);
    useBuildersStore
      .getState()
      .setActiveRun((p) => (p ? { ...p, status: "cancelled" } : null));

    try {
      if (rid) {
        await cancelRun(rid);
      }

      emitLocal({
        type: "cancelled",
        ts: new Date().toISOString(),
        message: "Cancelled by user",
      });

      hideTimerRef.current = setTimeout(() => {
        useRunUIStore.getState().hide();
        hideTimerRef.current = null;
      }, 800);

      useBuildersStore.getState().clearActiveRun();
      setRunState("idle");

      if (rid) {
        toast.info("Run cancelled", {
          duration: 8000,
          action: {
            label: "View in Clinic →",
            onClick: () =>
              router.push(`/clinic?runId=${encodeURIComponent(rid)}`),
          },
        });
      } else {
        toast.info("Run cancelled");
      }
    } catch (err) {
      console.error("Cancel failed", err);
      useRunUIStore.getState().setError("Failed to cancel run.");
      emitLocal({
        type: "error",
        ts: new Date().toISOString(),
        message: "Failed to cancel run.",
      });
    }
  }

  // Keep a ref in sync with running state so the stream timeout callback
  // (which closes over nothing) can check if the run is still active.
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const hasAgent = Boolean(agentId);
  const hasFile = Boolean(selectedPath);
  const canRun = hasAgent && hasFile && !running;

  return (
    <div className="flex flex-col gap-2">
      {!hasAgent && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            No agent bound.{" "}
            <button
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
              onClick={() => router.push("/builders?v=vibe")}
            >
              Select an agent in Vibe
            </button>{" "}
            or{" "}
            <button
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
              onClick={() => router.push("/builders?v=flow")}
            >
              open one from Flow
            </button>{" "}
            — then switch back to Pro.
          </span>
        </div>
      )}

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
            <button
              className="text-[11px] text-muted_fg hover:text-accent transition-colors"
              onClick={() =>
                router.push(`/clinic?runId=${encodeURIComponent(lastRunId)}`)
              }
              title="Open last run in Clinic"
            >
              Last run: <code className="font-mono">{lastRunId.slice(-8)}</code>
            </button>
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
              disabled={!canRun}
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            >
              <XCircle className="h-3 w-3" />
              Retry
            </Button>
          ) : (
            <Button
              size="xs"
              onClick={handleRun}
              disabled={!canRun}
              title={
                !hasAgent
                  ? "No agent bound — select one in Vibe or Flow first"
                  : !hasFile
                    ? "No file selected"
                    : "Run agent with current file content"
              }
              className="gap-1.5"
            >
              <Play className="h-3 w-3" />
              Run
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
