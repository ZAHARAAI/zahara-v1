"use client";

import { useEventBus } from "@/hooks/useEventBus";
import { useMemo } from "react";

const LogPanel = () => {
  const { runId, events } = useEventBus();

  const formatted = useMemo(
    () =>
      events.map((e, index) => {
        const ts =
          e.ts ||
          e.timestamp ||
          (typeof e["time"] === "string" ? (e["time"] as string) : null);

        const msg =
          e.message ?? e["text"] ?? e["detail"] ?? JSON.stringify(e, null, 2);

        const level =
          e.level ??
          (e.type === "error"
            ? "error"
            : e.type === "heartbeat"
            ? "debug"
            : "info");

        return {
          id: `${index}-${e.type}-${ts ?? "no-ts"}`,
          type: e.type,
          timestamp: ts,
          message: msg,
          level,
        };
      }),
    [events]
  );

  return (
    <div className="h-full border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
      <div className="h-full bg-background/40 text-xs">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium">Run logs</span>
            {runId && (
              <span className="font-mono text-[11px] text-muted-foreground/80">
                {runId}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {events.length} events
          </span>
        </div>

        <div className="h-full overflow-auto px-3 py-2">
          {formatted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No events yet. Run the agent to see live logs.
            </div>
          ) : (
            <ul className="space-y-1.5 overflow-auto ">
              {formatted.map((e) => (
                <li
                  key={e.id}
                  className={`rounded border border-[hsl(var(--border))] bg-background/80 px-3 py-1.5 ${
                    e.level === "error"
                      ? "border-red-500/40 bg-red-500/5 text-red-200"
                      : ""
                  } ${
                    e.type === "heartbeat"
                      ? "border-dashed border-[hsl(var(--border))]/60 text-muted-foreground/80"
                      : ""
                  }
                `}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase text-muted-foreground">
                      {e.type}
                    </span>
                    {e.timestamp && (
                      <span className="text-[10px] text-muted-foreground/80">
                        {e.timestamp}
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap wrap-break-word text-[11px]">
                    {e.message}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogPanel;
