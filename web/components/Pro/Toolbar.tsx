/* eslint-disable @typescript-eslint/no-explicit-any */
// components/Pro/Toolbar.tsx

"use client";
import { Button } from "@/components/ui/Button";
import { useEventBus } from "@/hooks/useEventBus";
import { startRun, streamRun } from "@/services/api";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useProStore } from "./store";

const DEFAULT_ENTRY = "agents/hello.ts";

export default function Toolbar() {
  const [busy, setBusy] = useState(false);
  const { runId, setRun, push } = useEventBus();
  const { activePath } = useProStore();

  // Use current file as entry if available
  const entry = useMemo(() => activePath || DEFAULT_ENTRY, [activePath]);

  const run = async () => {
    setBusy(true);
    try {
      const start = await startRun(entry, {});
      const id = start.runId;
      setRun(id);
      const stop = streamRun(id, (e) => push(e));
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
      {runId && <div className="text-xs opacity-70">run: {runId}</div>}
      <div className="ml-auto text-xs opacity-70">Pro IDE</div>
    </div>
  );
}
