/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createFlow, getFlow, listFlows, updateFlow } from "@/services/api";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useFlowStore } from "./store";

type Option = [string, string];

export default function Toolbar() {
  const { nodes, edges, flowId, flowName, setGraph, setFlowMeta } =
    useFlowStore();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false); // <-- now used
  const [options, setOptions] = useState<Option[]>([]);

  const refreshList = async () => {
    try {
      setLoading(true);
      const list = await listFlows("me");
      setOptions(list.items.map((i) => [i.id, i.name]));
    } catch (e: any) {
      toast.error("Failed to list flows", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      if (!flowId) {
        const env = await createFlow(flowName || "Untitled Flow", {
          nodes,
          edges,
        });
        const f = env.flow;
        setFlowMeta(f.id, f.name);
        toast.success("Flow created", { description: f.id });
      } else {
        await updateFlow(flowId, flowName, { nodes, edges });
        toast.success("Flow updated", { description: flowId });
      }
      await refreshList();
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const onLoad = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const env = await getFlow(id);
      const f = env.flow;
      setFlowMeta(f.id, f.name);
      setGraph(f.graph.nodes as any, f.graph.edges as any);
      toast.success("Flow loaded", { description: f.name });
    } catch (e: any) {
      toast.error("Load failed", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const openInPro = () => {
    const q = flowId ? `?flowId=${flowId}` : "";
    window.location.href = "/pro" + q;
  };

  const selectOptions: Option[] = useMemo(
    () => [["", loading ? "Loading flows…" : "Load flow…"], ...options],
    [loading, options]
  );

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border border-[hsl(var(--border))] rounded-2xl bg-[hsl(var(--panel))]">
      <Input
        style={{ width: 260 }}
        value={flowName}
        onChange={(e) => setFlowMeta(flowId, e.target.value)}
        placeholder="Flow name"
      />
      <Button onClick={onSave} disabled={saving || loading}>
        {saving ? "Saving..." : flowId ? "Save" : "Create"}
      </Button>

      <Select
        value=""
        onChange={(id) => onLoad(id)}
        options={selectOptions}
        disabled={loading || options.length === 0}
      />

      <Button variant="ghost" onClick={openInPro} disabled={loading}>
        Open in Pro
      </Button>

      <div className="ml-auto text-xs opacity-70">
        {loading ? "Loading…" : "Flow Builder"}
      </div>
    </div>
  );
}
