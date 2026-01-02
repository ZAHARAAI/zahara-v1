"use client";

import Canvas from "@/components/Flow/Canvas";
import Inspector from "@/components/Flow/Inspector";
import Toolbar from "@/components/Flow/Toolbar";
import LeftPanel from "@/components/Flow/LeftPanel";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useSearchParams } from "next/navigation";
import { useFlowStore } from "@/hooks/useFlowStore";
import { getAgent } from "@/services/api";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

export default function FlowPage() {
  const searchParams = useSearchParams();
  const agent_id = searchParams.get("agentId");
  const [showInspector, setShowInspector] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const hydratedRef = useRef<string | null>(null);
  const [loading, startTransition] = useTransition();

  const { meta, setFlowMeta, setFlowName, setGraph } = useFlowStore();

  useEffect(() => {
    const loadAgent = async (id: string) => {
      if (hydratedRef.current === id) return;
      hydratedRef.current = id;
      try {
        const { agent, spec, spec_version } = await getAgent(id);
        setFlowName(agent.name ?? "Untitled Flow Agent");
        setFlowMeta?.({
          ...meta,
          agentId: agent.id,
          agentVersion: spec_version,
          description: agent.description,
        });

        if (spec?.mode === "flow" && spec?.graph?.nodes && spec?.graph?.edges) {
          setGraph(spec.graph.nodes, spec.graph.edges);
        }
      } catch (err) {
        toast.error((err as Error)?.message ?? "Failed to load agent");
      }
    };

    startTransition(async () => {
      if (agent_id && agent_id !== meta?.agentId) {
        await loadAgent(agent_id);
      } else {
        const lastAgentId = localStorage.getItem("zahara.flow.lastAgentId");
        if (lastAgentId && lastAgentId !== meta?.agentId) {
          await loadAgent(lastAgentId);
        }
      }
    });
  }, [searchParams, meta, setFlowMeta, setFlowName, setGraph, agent_id]);

  return (
    <div className="relative h-[calc(100vh-3rem)]">
      <Suspense fallback={<div className="p-4 text-sm">Loading flow…</div>}>
        <Toolbar />
      </Suspense>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => setShowInspector((v) => !v)}>
          {showInspector ? "Hide Inspector" : "Show Inspector"}
        </Button>
      </div>

      <div className="mt-3 flex gap-3 h-[calc(100%-4rem)]">
        <LeftPanel
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
        />

        <div className="flex-1 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Canvas />
        </div>

        {showInspector && (
          <div className="w-[420px] border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
            <Inspector />
          </div>
        )}
      </div>
      {loading && (
        <Loader2Icon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 animate-spin" />
      )}
    </div>
  );
}
