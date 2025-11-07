/* eslint-disable @typescript-eslint/no-explicit-any */
// app/(job5)/flow/page.tsx
"use client";

import Canvas from "@/components/Flow/Canvas";
import Inspector from "@/components/Flow/Inspector";
import { useFlowStore } from "@/components/Flow/store";
import Toolbar from "@/components/Flow/Toolbar";
import { getFlow } from "@/services/api";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export default function FlowPage() {
  const searchParams = useSearchParams();
  const flowIdParam = searchParams.get("flowId");

  const { setFlowMeta, setGraph } = useFlowStore();

  useEffect(() => {
    const loadFlow = async () => {
      if (!flowIdParam) return;

      try {
        const res = await getFlow(flowIdParam); // { ok, flow }
        const f = res.flow;

        // guard just in case
        const nodes = (f?.graph?.nodes ?? []) as any[];
        const edges = (f?.graph?.edges ?? []) as any[];

        setFlowMeta(f.id, f.name ?? "Untitled Flow"); // correct API
        setGraph(nodes as any, edges as any); // pass both args

        toast.success("Flow loaded", { description: f.name });
      } catch (err: any) {
        toast.error("Error loading flow", {
          description: String(err?.message || err),
        });
      }
    };

    loadFlow();
  }, [flowIdParam, setFlowMeta, setGraph]);

  return (
    <div className="h-[calc(100vh-2rem)]">
      <Toolbar />

      <div className="mt-3 flex gap-3 h-[calc(100%-4rem)]">
        <div className="flex-1 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Canvas />
        </div>
        <div className="border w-80 border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
