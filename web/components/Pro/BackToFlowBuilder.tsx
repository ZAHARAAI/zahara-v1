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
    const file =
      n?.data?.entry ||
      n?.data?.file ||
      n?.data?.path ||
      n?.data?.script ||
      n?.data?.source;
    if (typeof file === "string" && file.includes(".")) return file;
  }
  return undefined;
}

const BackToFlowBuilder = () => {
  const searchParams = useSearchParams();
  const flowId = searchParams.get("flowId") || undefined;
  const { setActiveFile } = useProStore();
  const [flowName, setFlowName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const hydrateFromFlow = async () => {
      if (!flowId) return;

      try {
        const env = await getFlow(flowId); // { ok, flow }
        const flow = env.flow;
        if (!flow) return;

        if (!cancelled && typeof flow.name === "string") {
          setFlowName(flow.name);
        }

        const entry = inferEntryFromFlow(flow);
        if (entry) {
          const f = await readFile(entry); // { ok, path, content, sha }
          if (!cancelled) setActiveFile(f.path, f.content, f.sha);
        }
      } catch (e: any) {
        if (!cancelled) {
          toast.error("Failed to preload flow entry", {
            description: String(e?.message || e),
          });
        }
      }
    };
    hydrateFromFlow();
    return () => {
      cancelled = true;
    };
  }, [flowId, setActiveFile]);

  return (
    <>
      {flowId && (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 py-2 flex items-center text-sm">
          <div className="flex-1">
            <span className="font-medium">Flow:</span>{" "}
            <span className="opacity-90">{flowName || "Loading..."}</span>
            <span className="ml-3 text-xs opacity-70">id: {flowId}</span>
          </div>
          <Link
            href={`/flow?flowId=${encodeURIComponent(flowId)}`}
            className="inline-flex items-center justify-center rounded-2xl px-3.5 py-2 text-sm font-medium transition
             bg-[hsl(var(--muted))] text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted-2))] focus:outline-none
             focus:ring-2 focus:ring-[hsl(var(--ring))]"
          >
            ← Back to Flow Builder
          </Link>
        </div>
      )}
    </>
  );
};

export default BackToFlowBuilder;
