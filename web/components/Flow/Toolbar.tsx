/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  PlusCircle,
} from "lucide-react";

import { useFlowStore } from "@/hooks/useFlowStore";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import { useBuildersStore } from "@/hooks/useBuildersStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  startAgentRun,
  streamRun,
  upsertAgentFromFlow,
  type RunEvent,
} from "@/services/api";

// ── QuickRun 4-state button ────────────────────────────────────────────────
type RunButtonState = "idle" | "running" | "success" | "error";

function QuickRunButton({
  state,
  disabled,
  onClick,
}: {
  state: RunButtonState;
  disabled: boolean;
  onClick: () => void;
}) {
  const configs: Record<
    RunButtonState,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    idle: {
      icon: <Play className="h-3 w-3" />,
      label: "Quick Run",
      cls: "",
    },
    running: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Running…",
      cls: "opacity-70",
    },
    success: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Done ✓",
      cls: "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
    },
    error: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Failed",
      cls: "border-red-500/40 text-red-400 hover:bg-red-500/10",
    },
  };

  const { icon, label, cls } = configs[state];

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={onClick}
      disabled={disabled || state === "running"}
      className={`gap-1.5 transition-all duration-200 ${cls}`}
      title={
        disabled ? "Save flow as agent first, then type an input" : undefined
      }
    >
      {icon}
      {label}
    </Button>
  );
}

// ── Save button: Unsaved (amber) / Live (green) / default ─────────────────
function SaveSpecButton({
  saving,
  isDirty,
  hasAgent,
  onClick,
}: {
  saving: boolean;
  isDirty: boolean;
  hasAgent: boolean;
  onClick: () => void;
}) {
  if (saving) {
    return (
      <Button size="xs" disabled className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </Button>
    );
  }

  if (hasAgent && !isDirty) {
    return (
      <Button
        size="xs"
        variant="outline"
        onClick={onClick}
        className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
        title="Spec is live — click to force-save"
      >
        <CheckCircle2 className="h-3 w-3" />
        Live
      </Button>
    );
  }

  return (
    <Button
      size="xs"
      onClick={onClick}
      className={
        isDirty && hasAgent
          ? "gap-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-500 hover:bg-amber-500/15"
          : "gap-1.5"
      }
      title={
        isDirty && hasAgent ? "Unsaved changes — click to save" : undefined
      }
    >
      <Save className="h-3 w-3" />
      {hasAgent
        ? isDirty
          ? "Unsaved — Save"
          : "Update Spec"
        : "Save as Agent"}
    </Button>
  );
}

// ── Main Toolbar ───────────────────────────────────────────────────────────
export default function Toolbar() {
  const router = useRouter();

  const {
    nodes,
    edges,
    runInput,
    flowName,
    meta,
    setGraph,
    setRunInput,
    setFlowName,
    setFlowMeta,
    clearRunEvents,
    pushRunEvent,
  } = useFlowStore();

  const { show, hide } = useRunUIStore();

  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [runState, setRunState] = useState<RunButtonState>("idle");

  const agentId: string | undefined = meta?.agentId ?? undefined;
  const canRun = !!agentId && runInput.trim().length > 0;

  // ── Save / update spec ───────────────────────────────────────────────────
  async function handleSaveAsAgent() {
    if (!nodes || !edges) {
      toast.info("Please add blocks before saving.");
      return;
    }
    if (!flowName) {
      toast.info("Please enter a flow name.");
      return;
    }

    setSaving(true);
    try {
      const {
        agent: { id: newAgentId },
        spec_version: version,
      } = await upsertAgentFromFlow({
        agent_id: agentId,
        name: flowName,
        description:
          meta?.description ?? "Flow created from Zahara Flow Builder",
        graph: { nodes, edges },
        meta: { ...(meta ?? {}) },
      });

      setFlowMeta({
        ...(meta ?? {}),
        agentId: newAgentId,
        agentVersion: version,
      });
      useBuildersStore.getState().setSelectedAgentId(newAgentId);
      localStorage.setItem("zahara.flow.lastAgentId", newAgentId);
      setIsDirty(false);

      toast.success(
        agentId ? `Spec updated (v${version})` : `Agent created: ${newAgentId}`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save agent");
    } finally {
      hide();
      setSaving(false);
    }
  }

  function handleAddNew() {
    setRunInput("");
    setFlowName("");
    setFlowMeta({});
    setGraph([], []);
    setIsDirty(false);
  }

  // ── Quick Run ────────────────────────────────────────────────────────────
  async function handleQuickRun() {
    if (!agentId) {
      toast.error("Save this flow as an Agent first.");
      return;
    }
    const input = runInput.trim();
    if (!input) {
      toast.info("Type an input message to run.");
      return;
    }

    localStorage.setItem("zahara.flow.lastRunInput", input);
    setRunState("running");
    clearRunEvents?.();
    show("BUILD", "Running flow…");

    let runId: string | null = null;

    try {
      const res = await startAgentRun(agentId, {
        input,
        source: "flow",
        config: { flowName },
      });

      if (res?.budget?.percent_used && res?.budget?.percent_used >= 80) {
        toast.warning(`Budget ${res.budget.percent_used.toFixed(0)}% used`);
      }

      runId = res.run_id;

      // Sync into BuildersStore — ActiveRunBanner picks this up
      useBuildersStore.getState().setActiveRun({
        runId,
        status: "running",
        startedAt: Date.now(),
        source: "flow",
      });
      useBuildersStore.getState().setSelectedRunId(runId);

      pushRunEvent?.({
        type: "log",
        ts: new Date().toISOString(),
        message: `Run ${runId} started`,
        payload: { run_id: runId },
      });

      const stop = streamRun(
        runId,
        (ev: RunEvent) => {
          pushRunEvent?.(ev);

          if (ev.type === "done") {
            hide();
            setRunState("success");
            useBuildersStore.getState().clearActiveRun();
            const rid = runId;
            toast.success("Flow run completed!", {
              duration: 8000,
              action: rid
                ? {
                    label: "View in Clinic →",
                    onClick: () =>
                      router.push(`/clinic?runId=${encodeURIComponent(rid)}`),
                  }
                : undefined,
            });
            setTimeout(() => setRunState("idle"), 3000);
            stop();
          }

          if (ev.type === "error") {
            hide();
            setRunState("error");
            useBuildersStore
              .getState()
              .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
            toast.error(ev.message ?? "Run failed");
            setTimeout(() => setRunState("idle"), 4000);
            stop();
          }
        },
        { autoCloseMs: 1200 },
      );
    } catch (err: any) {
      hide();
      setRunState("error");
      useBuildersStore
        .getState()
        .setActiveRun((p) => (p ? { ...p, status: "error" } : null));
      toast.error(err?.message ?? "Failed to start run");
      setTimeout(() => setRunState("idle"), 4000);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-panel px-4 py-2 gap-3 shrink-0">
      {/* Left — name + agent context */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-muted_fg shrink-0">
          Flow
        </span>
        <Input
          value={flowName}
          onChange={(e) => {
            setFlowName(e.target.value);
            setIsDirty(true);
          }}
          className="h-7 w-[180px] text-xs font-mono"
          placeholder="Flow name…"
        />
        {meta?.agentId && (
          <span className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-muted_fg truncate">
            <span className="opacity-40">agent</span>
            <span className="opacity-60">…{meta.agentId.slice(-8)}</span>
            {meta.agentVersion && (
              <span className="opacity-35">v{meta.agentVersion}</span>
            )}
          </span>
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2 shrink-0">
        {meta?.agentId && (
          <Button
            size="xs"
            variant="ghost"
            onClick={handleAddNew}
            className="gap-1.5 text-muted_fg hover:text-fg"
            title="Clear canvas — start a new flow"
          >
            <PlusCircle className="h-3 w-3" />
            New
          </Button>
        )}

        <SaveSpecButton
          saving={saving}
          isDirty={isDirty}
          hasAgent={!!agentId}
          onClick={() => void handleSaveAsAgent()}
        />

        <div className="w-px h-4 bg-border shrink-0" />

        <Input
          value={runInput}
          onChange={(e) => setRunInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canRun && runState !== "running") void handleQuickRun();
            }
          }}
          className="h-7 w-60 text-xs"
          placeholder="Input for quick run… (Enter)"
        />

        <QuickRunButton
          state={runState}
          disabled={!canRun}
          onClick={() => void handleQuickRun()}
        />
      </div>
    </div>
  );
}
