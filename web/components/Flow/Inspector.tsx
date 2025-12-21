/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useFlowStore } from "@/hooks/useFlowStore";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AnyNodeData } from "./types";

const TABS = ["config", "prompt", "logs"] as const;
type Tab = (typeof TABS)[number];

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

type LogLine = {
  type: string;
  ts?: string;
  message: string;
  raw?: any;
};

export default function Inspector() {
  const { nodes, selectedId, setNodes, flowId, flowName, runEvents } =
    useFlowStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("config");

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId),
    [nodes, selectedId]
  );

  const updateNodeData = (patch: Partial<AnyNodeData>) => {
    if (!selected) return;
    const next = nodes.map((n) =>
      n.id === selected.id
        ? { ...n, data: { ...(n.data as any), ...patch } }
        : n
    );
    setNodes(next as any);
  };

  const openInPro = () => {
    router.push(
      "/pro" + (flowId ? `?flowId=${encodeURIComponent(flowId)}` : "")
    );
  };

  const formattedLogs: LogLine[] = useMemo(() => {
    const out: LogLine[] = [];

    for (const ev of runEvents as any[]) {
      const t = ev?.type ?? "log";
      const ts = ev?.ts ?? ev?.created_at ?? ev?.timestamp;

      if (t === "ping" || t === "done") continue;

      if (t === "token") {
        const text = ev?.message ?? ev?.payload?.text ?? "";
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.type === "token") {
          last.message += text;
        } else {
          out.push({ type: "token", ts, message: text, raw: ev });
        }
        continue;
      }

      if (t === "tool_call") {
        out.push({
          type: "tool_call",
          ts,
          message: summarizeToolCall(ev?.payload),
          raw: ev,
        });
        continue;
      }

      if (t === "tool_result") {
        out.push({
          type: "tool_result",
          ts,
          message: summarizeToolResult(ev?.payload),
          raw: ev,
        });
        continue;
      }

      if (t === "error") {
        const msg = ev?.message ?? ev?.payload?.message ?? "error";
        out.push({
          type: "error",
          ts,
          message: typeof msg === "string" ? msg : safeJson(msg),
          raw: ev,
        });
        continue;
      }

      const msg =
        ev?.message ??
        ev?.payload?.message ??
        ev?.payload?.text ??
        (typeof ev?.payload === "string"
          ? ev.payload
          : clip(safeJson(ev?.payload ?? ev), 600));

      out.push({
        type: t,
        ts,
        message: typeof msg === "string" ? msg : safeJson(msg),
        raw: ev,
      });
    }

    return out;
  }, [runEvents]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[hsl(var(--border))] p-3">
        <div className="text-sm font-medium">Inspector</div>
        <div className="text-xs opacity-70">{flowName}</div>
      </div>

      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] p-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-3 py-1.5 rounded-xl text-sm border",
              tab === t
                ? "border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                : "border-transparent opacity-70 hover:opacity-100",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {!selected ? (
          <div className="text-sm opacity-70">Select a node to edit.</div>
        ) : (
          <>
            {tab === "config" && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">Node Type</div>
                  <Select
                    value={(selected.data as any)?.type ?? selected.type ?? ""}
                    onChange={(v) => updateNodeData({ type: v as any })}
                    options={[
                      ["start", "Start"],
                      ["model", "Model"],
                      ["tool", "Tool"],
                      ["output", "Output"],
                    ]}
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Label</div>
                  <Input
                    value={(selected.data as any)?.label ?? ""}
                    onChange={(e) =>
                      updateNodeData({ label: e.target.value } as any)
                    }
                    placeholder="Optional label"
                  />
                </div>
              </div>
            )}

            {tab === "prompt" && (
              <div>
                <div className="text-xs opacity-70 mb-1">
                  Prompt / Instructions
                </div>
                <Textarea
                  value={(selected.data as any)?.prompt ?? ""}
                  onChange={(e) =>
                    updateNodeData({ prompt: e.target.value } as any)
                  }
                  placeholder="Write node instructions…"
                  rows={10}
                />
              </div>
            )}

            {tab === "logs" && (
              <div className="space-y-2">
                {formattedLogs.length === 0 ? (
                  <div className="text-xs opacity-70">
                    Run logs will appear here during execution.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
                    {formattedLogs.map((line, i) => (
                      <div
                        key={i}
                        className={[
                          "text-xs py-2 border-b border-[hsl(var(--border))] last:border-b-0",
                          line.type === "error" ? "text-red-200" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="opacity-70 font-mono text-[11px] uppercase">
                            {line.type}
                          </div>
                          {line.ts ? (
                            <div className="opacity-60 text-[10px]">
                              {line.ts}
                            </div>
                          ) : null}
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap wrap-break-word text-[11px] leading-relaxed">
                          {line.message}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] p-3">
        <Button onClick={openInPro}>Open in Pro</Button>
      </div>
    </div>
  );
}
