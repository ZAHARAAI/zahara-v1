/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Button } from "@/components/ui/Button";
import { api } from "@/services/api";
import { useState } from "react";
import { toast } from "sonner";
import { useFlowStore } from "./store";

export default function Toolbar() {
  const { nodes, edges } = useFlowStore();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    try {
      setSaving(true);
      const res = await api("/api/v1/flows", {
        method: "POST",
        body: JSON.stringify({ nodes, edges }),
      });
      const json = await res.json();
      
      toast.success("Flow saved.", {
        description: json?.id ? `id: ${json.id}` : undefined,
      });
    } catch (e: any) {
      toast.error("Failed to save flow", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await api("/api/v1/flows", { method: "GET" });
      const json = await res.json();
      if (json?.nodes && json?.edges) {
        useFlowStore.getState().setGraph(json);
        toast.success("Flow loaded");
      } else {
        toast.warning("No flow found");
      }
    } catch (e: any) {
      toast.error("Failed to load flow", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const openInPro = () => {
    window.location.href = "/pro?flow=current";
  };

  return (
    <div className="flex items-center gap-2 p-2 border border-[hsl(var(--border))] rounded-2xl bg-[hsl(var(--panel))]">
      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button variant="secondary" onClick={load} disabled={loading}>
        {loading ? "Loading..." : "Load"}
      </Button>
      <Button variant="ghost" onClick={openInPro}>
        Open in Pro
      </Button>
      <div className="ml-auto text-xs opacity-70">Flow Builder</div>
    </div>
  );
}
