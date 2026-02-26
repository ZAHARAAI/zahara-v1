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
import { toast } from "sonner";

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

type NodeKind = "start" | "model" | "tool" | "output";

// helpers
function toNumber(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function stringifyArgs(args: any) {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonLoose(s: string) {
  return JSON.parse(s || "{}");
}

export default function Inspector() {
  const { nodes, selectedId, setNodes, meta, flowName, runEvents } =
    useFlowStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("config");
  // JSON editor for tool args
  const [argsError, setArgsError] = useState<string>("");

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId),
    [nodes, selectedId],
  );

  // infer kind from node.type first, fallback to data.type
  const selectedKind: NodeKind | null = useMemo(() => {
    if (!selected) return null;
    const t = (selected.type ?? (selected.data as any)?.type) as any;
    if (t === "start" || t === "model" || t === "tool" || t === "output")
      return t;
    return null;
  }, [selected]);

  const updateNodeData = (patch: Partial<AnyNodeData>) => {
    if (!selected) return;
    const next = nodes.map((n) =>
      n.id === selected.id
        ? { ...n, data: { ...(n.data as any), ...patch } }
        : n,
    );
    setNodes(next as any);
  };

  const openInPro = () => {
    router.push(
      "/pro" +
        (meta?.agentId ? `?agentId=${encodeURIComponent(meta.agentId)}` : ""),
    );
  };

  const formattedLogs: LogLine[] = useMemo(() => {
    const out: LogLine[] = [];
    // console.log(runEvents);
    for (const ev of runEvents as any[]) {
      const t = ev?.type ?? "log";
      const ts = ev?.ts ?? ev?.created_at ?? ev?.timestamp;

      if (t === "ping") {
        const last = out[out.length - 1];

        if (last && last.type === "ping") {
          // increment counter
          last.raw.count = (last.raw.count ?? 1) + 1;
          last.message = `heartbeat x${last.raw.count}`;
        } else {
          out.push({
            type: "ping",
            ts,
            message: "heartbeat x1",
            raw: { count: 1 },
          });
        }

        continue;
      }

      if (t === "token") {
        const text = ev?.message ?? ev?.payload?.text ?? "";
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.type === "token") last.message += text;
        else out.push({ type: "token", ts, message: text, raw: ev });
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

      if (t === "done") {
        out.push({
          type: "done",
          ts,
          message: ev?.message ?? "run completed",
          raw: ev,
        });
        toast.success("run completed");
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

  const data = (selected?.data as any) ?? {};

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="text-sm font-medium">Inspector</div>
        <div className="text-xs opacity-70">{flowName}</div>
      </div>

      <div className="flex items-center gap-2 border-b border-border p-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-3 py-1.5 rounded-xl text-sm border",
              tab === t
                ? "border-border bg-card"
                : "border-transparent opacity-70 hover:opacity-100",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {!selected ? (
          tab !== "logs" ? (
            <div className="text-sm opacity-70">Select a node to edit.</div>
          ) : (
            ""
          )
        ) : (
          <>
            {tab === "config" && (
              <div className="space-y-4">
                {/* Common */}
                <div>
                  <div className="text-xs opacity-70 mb-1">Label</div>
                  <Input
                    value={data?.label ?? ""}
                    onChange={(e) =>
                      updateNodeData({ label: e.target.value } as any)
                    }
                    placeholder="Optional label"
                  />
                </div>

                {/* Node kind info (don’t let users change type unless you really want it) */}
                <div>
                  <div className="text-xs opacity-70 mb-1">Node</div>
                  <div className="text-xs font-mono opacity-80">
                    {selectedKind ?? "unknown"} • {selected.id}
                  </div>
                </div>

                {/* START */}
                {selectedKind === "start" && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="text-sm font-medium">Start settings</div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Trigger</div>
                      <Select
                        value={data?.trigger ?? "manual"}
                        onChange={(v) => updateNodeData({ trigger: v } as any)}
                        options={[
                          ["manual", "Manual"],
                          ["http", "HTTP"],
                          ["schedule", "Schedule"],
                        ]}
                      />
                    </div>
                  </div>
                )}

                {/* MODEL */}
                {selectedKind === "model" && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="text-sm font-medium">Model settings</div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Provider</div>
                      <Select
                        value={data?.provider ?? "openai"}
                        onChange={(v) => updateNodeData({ provider: v } as any)}
                        options={[
                          ["openai", "OpenAI"],
                          ["anthropic", "Anthropic"],
                          ["google", "Google"],
                          ["groq", "Groq"],
                          ["together", "Together"],
                          ["openrouter", "OpenRouter"],
                        ]}
                      />
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Model</div>
                      <Input
                        value={data?.model ?? ""}
                        onChange={(e) =>
                          updateNodeData({ model: e.target.value } as any)
                        }
                        placeholder='e.g. "gpt-4.1-mini"'
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs opacity-70 mb-1">
                          Temperature
                        </div>
                        <Input
                          value={String(data?.temperature ?? 0.7)}
                          onChange={(e) =>
                            updateNodeData({
                              temperature: toNumber(e.target.value, 0.7),
                            } as any)
                          }
                          placeholder="0.0 – 2.0"
                        />
                      </div>
                      <div>
                        <div className="text-xs opacity-70 mb-1">
                          Max tokens
                        </div>
                        <Input
                          value={String(data?.maxTokens ?? 800)}
                          onChange={(e) =>
                            updateNodeData({
                              maxTokens: toNumber(e.target.value, 800),
                            } as any)
                          }
                          placeholder="e.g. 800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TOOL */}
                {selectedKind === "tool" && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="text-sm font-medium">Tool settings</div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Tool name</div>
                      <Input
                        value={data?.toolName ?? ""}
                        onChange={(e) =>
                          updateNodeData({ toolName: e.target.value } as any)
                        }
                        placeholder='e.g. "web_search"'
                      />
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Mode</div>
                      <Select
                        value={data?.mode ?? "standard"}
                        onChange={(v) => updateNodeData({ mode: v } as any)}
                        options={[
                          ["standard", "Standard"],
                          ["function", "Function-call"],
                          ["mcp", "MCP"],
                        ]}
                      />
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">
                        Entry / Route
                      </div>
                      <Input
                        value={data?.entry ?? ""}
                        onChange={(e) =>
                          updateNodeData({ entry: e.target.value } as any)
                        }
                        placeholder='e.g. "/search" or "google.search"'
                      />
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Args (JSON)</div>

                      <Textarea
                        value={stringifyArgs(data?.args)}
                        onChange={(e) => {
                          const next = e.target.value;

                          // Store as string while typing (so we don't fight formatting)
                          updateNodeData({ args: next } as any);

                          // Live validate (optional)
                          try {
                            parseJsonLoose(next);
                            setArgsError("");
                          } catch (err: any) {
                            setArgsError(err?.message ?? "Invalid JSON");
                          }
                        }}
                        rows={8}
                        placeholder='{"q":"site:example.com","limit":5}'
                      />

                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          onClick={() => {
                            try {
                              const parsed = parseJsonLoose(
                                stringifyArgs(data?.args),
                              );
                              // Normalize stored value to an object on apply
                              updateNodeData({ args: parsed } as any);
                              setArgsError("");
                            } catch (err: any) {
                              setArgsError(err?.message ?? "Invalid JSON");
                            }
                          }}
                        >
                          Apply JSON
                        </Button>

                        {argsError ? (
                          <div className="text-xs text-red-200">
                            {argsError}
                          </div>
                        ) : (
                          <div className="text-xs opacity-60">
                            Stored in node.data.args
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* OUTPUT */}
                {selectedKind === "output" && (
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="text-sm font-medium">Output settings</div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Sink</div>
                      <Select
                        value={data?.sink ?? "console"}
                        onChange={(v) => updateNodeData({ sink: v } as any)}
                        options={[
                          ["console", "Console"],
                          ["webhook", "Webhook"],
                          ["file", "File"],
                        ]}
                      />
                    </div>

                    {data?.sink === "webhook" ? (
                      <div>
                        <div className="text-xs opacity-70 mb-1">
                          Webhook URL
                        </div>
                        <Input
                          value={data?.target ?? ""}
                          onChange={(e) =>
                            updateNodeData({ target: e.target.value } as any)
                          }
                          placeholder="https://example.com/webhook"
                        />
                      </div>
                    ) : null}
                  </div>
                )}
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
                  <div className="max-h-[360px] overflow-auto rounded-xl border border-border bg-card p-2">
                    {formattedLogs.map((line, i) => (
                      <div
                        key={i}
                        className={`text-xs py-2 border-b border-border last:border-b-0 ${
                          line.type === "error" ? "text-red-200" : ""
                        } ${
                          line.type === "ping" ? "text-blue-200 opacity-70" : ""
                        } ${
                          line.type === "done"
                            ? "text-green-500 opacity-70"
                            : ""
                        }`}
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

        {!selected && tab === "logs" && (
          <div className="space-y-2">
            {formattedLogs.length === 0 ? (
              <div className="text-xs opacity-70">
                Run logs will appear here during execution.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-xl border border-border bg-card p-2">
                {formattedLogs.map((line, i) => (
                  <div
                    key={i}
                    className={`text-xs py-2 border-b border-border last:border-b-0 ${
                      line.type === "error" ? "text-red-200" : ""
                    } ${
                      line.type === "ping" ? "text-blue-200 opacity-70" : ""
                    } ${
                      line.type === "done" ? "text-green-500 opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="opacity-70 font-mono text-[11px] uppercase">
                        {line.type}
                      </div>
                      {line.ts ? (
                        <div className="opacity-60 text-[10px]">{line.ts}</div>
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
      </div>

      <div className="border-t border-border p-3">
        <Button onClick={openInPro}>Open in Pro</Button>
      </div>
    </div>
  );
}
