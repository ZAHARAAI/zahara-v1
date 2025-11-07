"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEventBus } from "@/hooks/useEventBus";
import { startRun, streamRun } from "@/services/api";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_ENTRY = "agents/hello.ts";

export default function Timeline() {
  const { events, setRun, runId, push } = useEventBus();
  const [localRunId, setLocalRunId] = useState<string>("");
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  const attach = (id: string) => {
    stopRef.current?.();
    setRun(id);
    stopRef.current = streamRun(id, (data, type) =>
      push(type ? { type, ...data } : data)
    );
    toast.success("Attached to run", { description: id });
  };

  const replay = async () => {
    if (!runId) return;
    const start = await startRun(DEFAULT_ENTRY, { replay: runId });
    const id = start.runId;
    attach(id);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId || "current"}-events.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-2 border-b border-[hsl(var(--border))]">
        <Input
          style={{ width: 260 }}
          placeholder="Enter runId…"
          value={localRunId}
          onChange={(e) => setLocalRunId(e.target.value)}
        />
        <Button onClick={() => localRunId && attach(localRunId)}>Attach</Button>
        <Button variant="secondary" onClick={replay} disabled={!runId}>
          Replay
        </Button>
        <Button variant="ghost" onClick={exportJSON}>
          Export JSON
        </Button>
        <div className="ml-auto text-xs opacity-70">
          Events: {events.length}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {events.length === 0 && (
          <div className="opacity-60 text-sm">No events yet.</div>
        )}
        <ul className="space-y-2">
          {events.map((e, idx) => (
            <li
              key={idx}
              className="rounded-xl border border-[hsl(var(--border))] p-3"
            >
              <div className="text-xs uppercase opacity-70">{e.type}</div>
              {"message" in e && <div className="text-sm">{e.message}</div>}
              {"step" in e && <div className="text-sm">Step: {e.step}</div>}
              {"duration" in e && (
                <div className="text-sm">Duration: {e.duration}ms</div>
              )}
              {"tokens" in e && (
                <div className="text-sm">
                  Tokens: {e.tokens} {"cost" in e ? `(cost: ${e.cost})` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
