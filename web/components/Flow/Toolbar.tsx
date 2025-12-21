/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useFlowStore } from "@/hooks/useFlowStore";
import { useRunUIStore } from "@/hooks/useRunUIStore";
import { Button } from "@/components/ui/Button";
import {
  startAgentRun,
  streamRun,
  upsertAgentFromFlow,
  type RunEvent,
} from "@/services/api";

export default function Toolbar() {
  const router = useRouter();
  const {
    nodes,
    edges,
    flowId,
    flowName,
    meta,
    setFlowMeta,
    clearRunEvents,
    pushRunEvent,
  } = useFlowStore();
  const { show, hide } = useRunUIStore();

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const agentId: string | undefined = meta?.agentId ?? undefined;

  async function handleSaveAsAgent() {
    if (!nodes || !edges) return;

    setSaving(true);
    try {
      const name = flowName || "Untitled Flow";
      const description =
        meta?.description ?? "Flow created from Zahara Flow Builder";

      const {
        agent: { id: newAgentId },
        spec_version: version,
      } = await upsertAgentFromFlow({
        agent_id: agentId,
        name,
        description,
        graph: { nodes, edges },
        meta: { flowId, ...(meta ?? {}) },
      });

      setFlowMeta({
        ...(meta ?? {}),
        agentId: newAgentId,
        agentVersion: version,
      });

      toast.success(
        agentId
          ? `Updated agent spec (v${version}) for this flow`
          : `Created new agent for this flow: ${newAgentId}`
      );
    } catch (err: any) {
      console.error("Failed to save agent from flow", err);
      toast.error(err?.message ?? "Failed to save agent from flow");
    } finally {
      hide();
      setSaving(false);
    }
  }

  async function handleQuickRun() {
    const currentAgentId = meta?.agentId as string | undefined;
    if (!currentAgentId) {
      toast.error("Save this flow as an Agent first.");
      return;
    }

    setRunning(true);
    clearRunEvents?.();
    show("BUILD", "Running flow…");

    // Optionally show a local event in Flow UI
    const addLocal = (ev: RunEvent) => {
      pushRunEvent?.(ev);
    };

    try {
      const { run_id } = await startAgentRun(currentAgentId, {
        input: "Test run from Flow Builder.",
        source: "flow",
        config: { flowId, flowName },
      });

      addLocal({
        type: "log",
        ts: new Date().toISOString(),
        message: `Started run ${run_id} for agent ${currentAgentId}`,
        payload: { run_id, agentId: currentAgentId },
      });

      const stop = streamRun(
        run_id,
        (ev) => {
          addLocal(ev);
          if (ev.type === "done" || ev.type === "error") {
            hide();
            setRunning(false);
          }
          if (ev.type === "done" || ev.type === "error") {
            stop();
          }
        },
        { autoCloseMs: 1200 }
      );
    } catch (err: any) {
      console.error("Flow quick run failed", err);
      toast.error(err?.message ?? "Failed to run agent from flow");
    } finally {
      hide();
      setRunning(false);
    }
  }

  function handleOpenInPro() {
    const query = new URLSearchParams();
    if (flowId) query.set("flowId", flowId);
    if (meta?.agentId) query.set("agentId", meta.agentId as string);
    router.push(`/pro?${query.toString()}`);
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted-fg))]">
          Flow Builder
        </span>
        <span className="text-[12px] font-mono">
          {flowName || "Untitled Flow"}
        </span>
        {meta?.agentId && (
          <span className="text-[11px] text-[hsl(var(--muted-fg))]">
            Agent: <code className="font-mono">{meta.agentId}</code>
            {meta.agentVersion && ` (v${meta.agentVersion})`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={handleSaveAsAgent}
          disabled={saving}
        >
          {saving
            ? "Saving…"
            : meta?.agentId
            ? "Update Agent Spec"
            : "Save as Agent"}
        </Button>

        <Button
          size="xs"
          variant="outline"
          onClick={handleQuickRun}
          disabled={running || !meta?.agentId}
        >
          {running ? "Running…" : "Quick Run"}
        </Button>

        <Button size="xs" variant="primary" onClick={handleOpenInPro}>
          Open in Pro
        </Button>
      </div>
    </div>
  );
}
