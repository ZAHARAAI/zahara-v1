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

  const { activePath, content } = useProStore();
  const { setRun, push, clear } = useEventBus();

  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | undefined>();

  const entry = useMemo(
    () => activePath || DEFAULT_ENTRY,
    [activePath],
  );

  const run = async () => {
    try {
      setBusy(true);
      clear();

      const payload: any = {
        source: "pro-ide",
        model: "gpt-4",
        entry,
        code: content,
      };
      if (flowId) payload.flowId = flowId;

      const res = await startRun(payload);
      setRunId(res.runId);
      setRun(res.runId);

      const stop = streamRun(res.runId, (data: any, type?: string) => {
        if (type === "metric") {
          push({
            type: "metric",
            tokens: data?.payload?.tokens,
            cost: data?.payload?.cost,
            duration: data?.payload?.latency_ms,
          });
        } else if (type === "log") {
          push({
            type: "log",
            level: data?.payload?.level ?? "info",
            message: data?.payload?.message,
          });
        } else if (type === "status") {
          push({
            type: "status",
            message: data?.payload?.status,
          });
        } else {
          push(data);
        }
      });

      // auto-stop when "done" appears
      push({
        type: "info",
        message: `Streaming events for run ${res.runId}`,
      });

      return stop;
    } catch (e: any) {
      toast.error("Run failed", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-3 py-2">
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
