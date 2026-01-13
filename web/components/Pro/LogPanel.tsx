/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEventBus } from "@/hooks/useEventBus";
import { useMemo } from "react";

function safeJson(x: any): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function clip(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function summarizeToolCall(payload: any): string {
  const tc =
    payload?.tool_call ??
    payload?.tool_calls?.[0] ??
    payload?.function_call ??
    payload;
  const fn = tc?.function ?? tc ?? {};
  const name = fn?.name ?? tc?.name ?? "tool";
  const args = fn?.arguments ?? tc?.arguments ?? "";
  const argsStr = typeof args === "string" ? args : safeJson(args);
  const compact = clip(argsStr.replace(/\s+/g, " ").trim(), 220);
  return compact ? `tool_call: ${name}(${compact})` : `tool_call: ${name}`;
}

function summarizeToolResult(payload: any): string {
  const tr = payload?.tool_result ?? payload?.tool_results?.[0] ?? payload;
  const name = tr?.name ?? tr?.tool_name ?? tr?.id ?? "tool";
  const out =
    tr?.content ?? tr?.output ?? tr?.result ?? tr?.text ?? tr?.value ?? "";
  const outStr = typeof out === "string" ? out : safeJson(out);
  const compact = clip(outStr.replace(/\s+/g, " ").trim(), 240);
  return compact ? `tool_result: ${name} → ${compact}` : `tool_result: ${name}`;
}

const LogPanel = () => {
  const { runId, events } = useEventBus();

  const formatted = useMemo(() => {
    const out: Array<{
      id: string;
      type: string;
      timestamp?: string | null;
      message: string;
      level: "debug" | "info" | "error";
    }> = [];

    for (let index = 0; index < events.length; index++) {
      const e: any = events[index];
      const type = e.type ?? "log";
      const ts =
        e.ts ||
        e.timestamp ||
        (typeof e["time"] === "string" ? (e["time"] as string) : null);

      if (type === "ping" || type === "done") {
        out.push({
          id: `${index}-${type}-${ts ?? "no-ts"}`,
          type,
          timestamp: ts,
          message: type,
          level: "debug",
        });
        continue;
      }

      if (type === "token") {
        const t = (e.message ?? e.payload?.text ?? "") as string;
        if (!t) continue;

        const last = out[out.length - 1];
        if (last && last.type === "token" && last.level === "info") {
          last.message += t;
        } else {
          out.push({
            id: `${index}-token-${ts ?? "no-ts"}`,
            type: "token",
            timestamp: ts,
            message: t,
            level: "info",
          });
        }
        continue;
      }

      if (type === "tool_call") {
        out.push({
          id: `${index}-tool_call-${ts ?? "no-ts"}`,
          type: "tool_call",
          timestamp: ts,
          message: summarizeToolCall(e.payload),
          level: "info",
        });
        continue;
      }

      if (type === "tool_result") {
        out.push({
          id: `${index}-tool_result-${ts ?? "no-ts"}`,
          type: "tool_result",
          timestamp: ts,
          message: summarizeToolResult(e.payload),
          level: "info",
        });
        continue;
      }

      const msg =
        e.message ??
        e.payload?.message ??
        e["text"] ??
        e["detail"] ??
        (e.payload ? safeJson(e.payload) : safeJson(e));

      const level: "debug" | "info" | "error" =
        e.level ?? (type === "error" ? "error" : "info");

      out.push({
        id: `${index}-${type}-${ts ?? "no-ts"}`,
        type,
        timestamp: ts,
        message: typeof msg === "string" ? msg : safeJson(msg),
        level,
      });
    }

    return out;
  }, [events]);

  return (
    <div className="h-full border border-border rounded-2xl overflow-hidden">
      <div className="h-full bg-bg/40 text-xs">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-muted_fg">
            <span className="font-medium">Run logs</span>
            {runId && (
              <span className="font-mono text-[11px] text-muted_fg/80">
                {runId}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted_fg">
            {events.length} events
          </span>
        </div>

        <div className="h-full overflow-auto px-3 py-2">
          {formatted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted_fg">
              No events yet. Run the agent to see live logs.
            </div>
          ) : (
            <ul className="space-y-1.5 overflow-auto">
              {formatted.map((e) => (
                <li
                  key={e.id}
                  className={[
                    "rounded border border-border bg-bg/80 px-3 py-1.5",
                    e.level === "error"
                      ? "border-red-500/40 bg-red-500/5 text-red-200"
                      : "",
                    e.type === "ping"
                      ? "border-dashed border-border/60 text-muted_fg/80"
                      : "",
                  ].join(" ")}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase text-">
                      {e.type}
                    </span>
                    {e.timestamp && (
                      <span className="text-[10px] text-muted_fg/80">
                        {e.timestamp}
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap wrap-break-word text-[11px] leading-relaxed">
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
