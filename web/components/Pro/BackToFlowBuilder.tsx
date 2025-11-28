/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useProStore } from "@/hooks/useProStore";
import { inferEntryFromNodes } from "@/lib/utilities";
import { getFlow } from "@/services/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function inferEntryFromFlow(flow: any): string | undefined {
  const metaEntry = flow?.graph?.meta?.entry;
  if (typeof metaEntry === "string" && metaEntry.trim()) return metaEntry;

  const nodes = flow?.graph?.nodes ?? [];
  // Extract entry value from nodes
  const entry = inferEntryFromNodes(nodes);
  return entry;
}

const BackToFlowBuilder = () => {
  const searchParams = useSearchParams();
  const flowId = searchParams.get("flowId") || undefined;
  const flowName = searchParams.get("name") || "";
  const { openFile } = useProStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flowId) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const flow = await getFlow(flowId);
        const entry = inferEntryFromFlow(flow);

        if (!entry) {
          toast.error("No entry file found for this flow", {
            description: `Set "graph.meta.entry" or a node with "data.entryFile" in the flow.`,
          });
          return;
        }

        if (cancelled) return;

        await openFile(entry);
      } catch (e: any) {
        if (cancelled) return;
        console.error("Failed to load flow entry", e);
        toast.error("Failed to load flow entry", {
          description: e?.message ?? "Check that the entry file exists.",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [flowId, openFile]);

  if (!flowId) return null;

  return (
    <div className="mb-1 flex items-center justify-between text-xs">
      <div className="opacity-70">
        {loading ? "Loading flow entry…" : `Flow: ${flowName || flowId}`}
      </div>
      <Link
        href={`/flow?flowId=${encodeURIComponent(flowId)}`}
        className="inline-flex items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted-2))] transition-colors"
      >
        ← Back to Flow Builder
      </Link>
    </div>
  );
};

export default BackToFlowBuilder;
