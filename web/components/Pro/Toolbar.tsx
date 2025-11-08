/* eslint-disable @typescript-eslint/no-explicit-any */
// components/Pro/Toolbar.tsx
"use client";
import { Button } from "@/components/ui/Button";
import { useEventBus } from "@/hooks/useEventBus";
import { startRun, streamRun } from "@/services/api";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useProStore } from "./store";

const DEFAULT_ENTRY = "agents/hello.ts";

export default function Toolbar() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get("flowId") || undefined;
  const [busy, setBusy] = useState(false);
  const { runId, setRun, push } = useEventBus();
  const { activePath } = useProStore();

  // Use current file as entry if available
  const entry = useMemo(() => activePath || DEFAULT_ENTRY, [activePath]);

  const run = async () => {
    setBusy(true);
    try {
      // Include flowId as args context (backend can link run → flow)
      const start = await startRun(entry, flowId ? { flowId } : {});
      const id = start.runId;
      setRun(id);

      // Preserve named SSE event types in the log stream
      const stop = streamRun(id, (data, type) =>
        push(type ? { type, ...data } : data)
      );
      (window as any).__job5_stop = stop;

      toast.success("Run started", { description: id });
    } catch (e: any) {
      toast.error("Run failed to start", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 border border-[hsl(var(--border))] rounded-2xl bg-[hsl(var(--panel))]">
      <Button onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run"}
      </Button>
      <div className="text-xs opacity-70">entry: {entry}</div>
      {flowId && <div className="text-xs opacity-70">flow: {flowId}</div>}
      {runId && <div className="text-xs opacity-70">run: {runId}</div>}
      <div className="ml-auto text-xs opacity-70">Pro IDE</div>
    </div>
  );
}
