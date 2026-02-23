/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

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
import { Input } from "../ui/Input";

export default function Toolbar() {
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
  const [running, setRunning] = useState(false);
  const agentId: string | undefined = meta?.agentId ?? undefined;

  async function handleSaveAsAgent() {
    // if (!nodes?.length || !edges?.length) {
    if (!nodes || !edges) {
      toast.info("Please set blocks to save as agent.");
      return;
    }
    if (!flowName) {
      toast.info("Please enter a flow name.");
      return;
    }

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
        meta: { ...(meta ?? {}) },
      });

      setFlowMeta({
        ...(meta ?? {}),
        agentId: newAgentId,
        agentVersion: version,
      });

      localStorage.setItem("zahara.flow.lastAgentId", newAgentId);
      toast.success(
        agentId
          ? `Updated agent spec (v${version}) for this flow`
          : `Created new agent for this flow: ${newAgentId}`,
      );
    } catch (err: any) {
      // console.error("Failed to save agent from flow", err);
      toast.error(err?.message ?? "Failed to save agent from flow");
    } finally {
      hide();
      setSaving(false);
    }
  }

  async function handleAddNew() {
    setRunInput("");
    setFlowName("");
    setFlowMeta({});
    setGraph([], []);
  }

  async function handleQuickRun() {
    const currentAgentId = meta?.agentId as string | undefined;
    if (!currentAgentId) {
      toast.error("Save this flow as an Agent first.");
      return;
    }

    const input = runInput.trim();
    if (!input) {
      toast.info("Type an input message to run this agent.");
      return;
    }

    localStorage.setItem("zahara.flow.lastRunInput", input);

    setRunning(true);
    clearRunEvents?.();
    show("BUILD", "Running flow…");

    // Optionally show a local event in Flow UI
    const addLocal = (ev: RunEvent) => {
      pushRunEvent?.(ev);
    };

    try {
      const res = await startAgentRun(currentAgentId, {
        input,
        source: "flow",
        config: { flowName },
      });

      if (res?.budget && typeof res.budget.percent_used === "number") {
        const pct = res.budget.percent_used;
        if (pct >= 80 && pct < 100) {
          toast.warning(
            `Budget warning: ${pct.toFixed(0)}% of today's agent budget used`,
          );
        }
      }

      const run_id = res.run_id;

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
        { autoCloseMs: 1200 },
      );
    } catch (err: any) {
      hide();
      // console.error("Flow quick run failed", err);
      toast.error(err?.message ?? "Failed to run agent from flow");
    } finally {
      // hide();
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted_fg">
          Flow Builder
        </span>
        <Input
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          className="h-7 w-[260px] text-xs font-mono"
          placeholder="Enter flow name…"
        />
        {meta?.agentId && (
          <span className="text-[11px] text-muted_fg">
            Agent: <code className="font-mono">{meta.agentId}</code>
            {meta.agentVersion && ` (v${meta.agentVersion})`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {meta?.agentId && (
          <Button size="xs" variant="outline" onClick={handleAddNew}>
            {saving ? "Adding..." : "Add New"}
          </Button>
        )}
        <Button size="xs" onClick={handleSaveAsAgent} disabled={saving}>
          {saving
            ? "Saving..."
            : meta?.agentId
              ? "Update Agent Spec"
              : "Save as Agent"}
        </Button>

        <Input
          value={runInput}
          onChange={(e) => setRunInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!running && meta?.agentId) {
                void handleQuickRun();
              }
            }
          }}
          className="h-7 w-[320px] text-xs"
          placeholder="Type an input message…"
        />

        <Button
          size="xs"
          onClick={handleQuickRun}
          disabled={running || !meta?.agentId}
        >
          {running ? "Running…" : "Quick Run"}
        </Button>
      </div>
    </div>
  );
}
