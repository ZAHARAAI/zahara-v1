/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Handle, Position, type NodeProps } from "reactflow";

const SINK_LABEL: Record<string, string> = {
  console: "Console log",
  webhook: "Webhook",
  file: "File output",
};

const SINK_HINT: Record<string, string> = {
  console: "Writes the final response to logs for observability.",
  webhook: "POSTs the final response to an external HTTP endpoint.",
  file: "Persists the final response to a file or object store.",
};

export function OutputNode({ data }: NodeProps<any>) {
  const sinkKey = (data?.sink as string | undefined) || "console";
  const sinkLabel = SINK_LABEL[sinkKey] || sinkKey;
  const sinkHint = SINK_HINT[sinkKey];

  return (
    <div className="rounded-xl border border-border bg-panel shadow-sm min-w-[180px]">
      <div className="px-3 py-2 text-xs uppercase tracking-wide border-b border-border text-gray-200 ">
        {data?.title || "Output"}
      </div>
      <div className="p-3 text-xs space-y-1">
        <div className="space-y-1 text-[11px] leading-snug">
          <div className="flex items-center justify-between gap-2">
            <span className="opacity-70 text-gray-400 ">Sink</span>
            <span className="font-mono truncate max-w-[140px] text-gray-600">
              {sinkLabel}
            </span>
          </div>

          {sinkHint && (
            <div className="mt-1 text-[10px] opacity-80 text-gray-500">
              {sinkHint}
            </div>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
