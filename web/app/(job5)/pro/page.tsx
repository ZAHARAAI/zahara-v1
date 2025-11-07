/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import FileTree from "@/components/Pro/FileTree";
import LogPanel from "@/components/Pro/LogPanel";
import { useProStore } from "@/components/Pro/store";
import Toolbar from "@/components/Pro/Toolbar";
import { getFlow, readFile } from "@/services/api";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const Editor = dynamic(() => import("@/components/Pro/Editor"), { ssr: false });

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

export default function ProPage() {
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
    <div className="grid grid-rows-[auto_auto_1fr_minmax(160px,280px)] gap-3 h-[calc(100vh-2rem)]">
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

      <Toolbar flowId={flowId} />

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <FileTree />
        </div>
        <div className="col-span-9 border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <Editor />
        </div>
      </div>

      <div className="border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
        <LogPanel />
      </div>
    </div>
  );
}
