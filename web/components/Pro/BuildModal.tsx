/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRunUIStore } from "@/hooks/useRunUIStore";

function clip(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function safeJson(x: any): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
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
  const compact = clip(argsStr.replace(/\s+/g, " ").trim(), 180);
  return compact ? `tool_call: ${name}(${compact})` : `tool_call: ${name}`;
}

function summarizeToolResult(payload: any): string {
  const tr = payload?.tool_result ?? payload?.tool_results?.[0] ?? payload;
  const name = tr?.name ?? tr?.tool_name ?? tr?.id ?? "tool";
  const out =
    tr?.content ?? tr?.output ?? tr?.result ?? tr?.text ?? tr?.value ?? "";
  const outStr = typeof out === "string" ? out : safeJson(out);
  const compact = clip(outStr.replace(/\s+/g, " ").trim(), 200);
  return compact ? `tool_result: ${name} → ${compact}` : `tool_result: ${name}`;
}

function formatLine(type: string, message?: string, payload?: any) {
  if (type === "token")
    return clip(String(message ?? payload?.text ?? ""), 220);
  if (type === "tool_call") return summarizeToolCall(payload);
  if (type === "tool_result") return summarizeToolResult(payload);
  if (type === "error") return String(message ?? payload?.message ?? "error");
  if (type === "log")
    return String(message ?? payload?.message ?? payload?.text ?? "log");
  if (type === "system") return "system";
  if (type === "ping") return "ping";
  if (type === "done") return "done";
  return clip(
    String(message ?? payload?.message ?? safeJson(payload ?? "")),
    220
  );
}

interface BuildModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
  onClose?: () => void;
}

export default function BuildModal({
  open,
  title: titleProp,
  subtitle: subtitleProp,
  onCancel,
  onClose,
}: BuildModalProps) {
  const title = useRunUIStore((s) => s.title);
  const subtitle = useRunUIStore((s) => s.subtitle);
  const phase = useRunUIStore((s) => s.phase);
  const errorMessage = useRunUIStore((s) => s.errorMessage);
  const logs = useRunUIStore((s) => s.logs);
  const isClosing = useRunUIStore((s) => s.isClosing);
  const hideWithFade = useRunUIStore((s) => s.hideWithFade);

  if (!open) return null;

  const finalTitle = titleProp ?? title ?? "Running agent";
  const finalSubtitle = subtitleProp ?? subtitle ?? "Executing run pipeline…";

  const isError = phase === "error";
  const isDone = phase === "done";
  const isFinalizing = phase === "finalizing";

  const Icon = isError ? XCircle : isDone ? CheckCircle2 : Loader2;

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/40 backdrop-blur-sm",
        "transition-opacity duration-150",
        isClosing ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div
        className={[
          "w-full max-w-sm rounded-2xl border p-4 shadow-lg",
          "bg-[hsl(var(--panel))] border-[hsl(var(--border))]",
          "transition-all duration-150",
          isClosing ? "opacity-0 scale-[0.98]" : "opacity-100 scale-100",
          isError ? "border-red-500/40 bg-red-500/5" : "",
          isDone ? "border-emerald-500/40 bg-emerald-500/5" : "",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <Icon
            className={[
              "h-4 w-4",
              isError ? "text-red-300" : isDone ? "text-emerald-300" : "",
              isDone || isError ? "" : "animate-spin",
            ].join(" ")}
          />
          <div className="flex flex-col">
            <span className="text-[14px] font-medium">{finalTitle}</span>
            <span className="text-[11px] text-[hsl(var(--muted-fg))]">
              {isFinalizing ? "Finalizing run…" : finalSubtitle}
            </span>
          </div>
        </div>

        {/* Error */}
        {isError && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-100">
            <div className="font-semibold">Error</div>
            <div className="mt-1 whitespace-pre-wrap wrap-break-word">
              {errorMessage ?? "Run failed."}
            </div>
          </div>
        )}

        {/* Mini logs */}
        <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[hsl(var(--muted-fg))]">
              Live events
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-fg))]">
              {logs?.length ?? 0}/5
            </span>
          </div>

          {!logs || logs.length === 0 ? (
            <div className="text-[11px] text-[hsl(var(--muted-fg))]">
              Waiting for stream…
            </div>
          ) : (
            <ul className="space-y-1">
              {logs.map((l, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase text-[hsl(var(--muted-fg))]">
                      {l.type}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--muted-fg))]">
                      {l.ts ? new Date(l.ts).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap wrap-break-word text-[11px] leading-relaxed">
                    {formatLine(l.type, l.message, l.payload)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          {onCancel && !isDone && !isError && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}

          {(isDone || isError) && (
            <Button
              size="sm"
              onClick={() => {
                onClose?.();
                hideWithFade(180);
              }}
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
