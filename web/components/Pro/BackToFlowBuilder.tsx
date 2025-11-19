/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { getFlow, readFile } from "@/services/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useProStore } from "./store";

function inferEntryFromFlow(flow: any): string | undefined {
  const metaEntry = flow?.graph?.meta?.entry;
  if (typeof metaEntry === "string" && metaEntry.trim()) return metaEntry;

  const nodes = flow?.graph?.nodes ?? [];
  for (const n of nodes) {
    if (n.data?.entryFile && typeof n.data.entryFile === "string") {
      return n.data.entryFile;
    }
  }
  return undefined;
}

const BackToFlowBuilder = () => {
  const searchParams = useSearchParams();
  const flowId = searchParams.get("flowId") || undefined;
  const { setActiveFile } = useProStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flowId) return;
    const load = async () => {
      try {
        setLoading(true);
        const flow = await getFlow(flowId);
        const entry = inferEntryFromFlow(flow);
        if (!entry) return;
        const file = await readFile(entry);
        setActiveFile(file.path, file.content, file.sha);
      } catch (e: any) {
        toast.error("Failed to load flow entry", { description: e.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [flowId, setActiveFile]);

  if (!flowId) return null;

  return (
    <div className="mb-1 flex items-center justify-between text-xs">
      <div className="opacity-70">
        {loading ? "Loading flow entry…" : `Flow: ${flowId}`}
      </div>
      <Link
        href={`/flow?flowId=${encodeURIComponent(flowId)}`}
        className="inline-flex items-center justify-center rounded-2xl px-3 py-1.5 text-xs font-medium bg-[hsl(var(--muted))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted-2))]"
      >
        ← Back to Flow Builder
      </Link>
    </div>
  );
};

export default BackToFlowBuilder;
