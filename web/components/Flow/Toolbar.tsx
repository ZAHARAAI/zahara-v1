/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useFlowStore } from "@/hooks/useFlowStore";
import { inferEntryFromNodes } from "@/lib/utilities";
import { createFlow, getFlow, listFlows, updateFlow } from "@/services/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FlowGraph } from "./types";

type Option = [string, string];

export default function Toolbar() {
  const searchParams = useSearchParams();
  const flowIdParam = searchParams.get("flowId") || undefined;
  const router = useRouter();

  const { nodes, edges, flowId, flowName, setFlowMeta, setGraph } =
    useFlowStore();

  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  const selectOptions = useMemo<Option[]>(
    () => [["", "New flow"], ...options],
    [options]
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const flows = await listFlows();
      setOptions(
        flows.map((f) => [f.id, f.name || `Untitled (${f.id.slice(0, 8)})`])
      );
    } catch (e: any) {
      toast.error("Failed to load flows", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!flowIdParam) return;
    const open = async () => {
      try {
        setLoading(true);
        const json = await getFlow(flowIdParam);
        setFlowMeta(json.id, json.name);
        setGraph((json.graph?.nodes as any) ?? [], json.graph?.edges ?? []);
      } catch (e: any) {
        toast.error("Failed to open flow", { description: e.message });
      } finally {
        setLoading(false);
      }
    };
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowIdParam]);

  const onSelect = async (id: string) => {
    if (!id) {
      setFlowMeta(undefined, "Untitled Flow");
      setGraph([], []);
      router.replace("/flow");
      return;
    }
    router.replace(`/flow?flowId=${encodeURIComponent(id)}`);
  };

  const save = async () => {
    if (nodes.length === 0 && edges.length === 0) {
      return toast.warning("Nothing to save", {
        description: "Add at least one node or edge.",
      });
    }

    try {
      setLoading(true);
      // Extract entry value from nodes
      const entry = inferEntryFromNodes(nodes);
      const graph = { nodes, edges, meta: { entry } } as FlowGraph;
      if (flowId) {
        await updateFlow(flowId, flowName, graph);
        setFlowMeta(flowId, flowName);
        toast.success("Flow updated", { description: flowName });
      } else {
        const json = await createFlow(flowName || "Untitled Flow", graph);
        setFlowMeta(json.id, json.name);
        router.replace(`/flow?flowId=${encodeURIComponent(json.id)}`);
        toast.success("Flow created", { description: json.name });
      }
      await load();
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border border-[hsl(var(--border))] rounded-2xl bg-[hsl(var(--panel))] px-3 py-2">
      <Select
        label="Flow"
        value={flowId || ""}
        onChange={(v: string) => onSelect(v)}
        options={selectOptions}
      />

      <Input
        label="Name"
        value={flowName}
        onChange={(e) => setFlowMeta(flowId, e.target.value)}
        placeholder="Untitled Flow"
      />

      <Button onClick={save} disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>

      <div className="ml-auto flex items-center gap-3 text-xs opacity-70">
        {loading && <span>Loading…</span>}
        {flowId ? (
          <span>
            Active:{" "}
            <span className="font-medium">{flowName || "Untitled Flow"}</span>
          </span>
        ) : (
          <span>Flow Builder</span>
        )}
      </div>
    </div>
  );
}
