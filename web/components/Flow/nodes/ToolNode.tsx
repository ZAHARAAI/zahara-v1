/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

export function ToolNode({ data }: NodeProps<any>) {
  const args = data?.args || {};
  const argKeys = Object.keys(args);

  const primaryArgs = argKeys.slice(0, 3).join(", ");
  const hasMore = argKeys.length > 3;

  return (
    <NodeChrome title={data?.title || "Tool"}>
      <div className="space-y-1 text-[11px] leading-snug">
        <div className="flex items-center justify-between gap-2">
          <span className="opacity-70">Tool Name</span>
          <span className="font-mono truncate max-w-[140px]">
            {data?.toolName || "unnamed"}
          </span>
        </div>

        {data?.mode && (
          <div className="flex items-center justify-between gap-2">
            <span className="opacity-70">Mode</span>
            <span className="font-mono truncate max-w-[140px]">
              {data.mode}
            </span>
          </div>
        )}

        {data?.entry && (
          <div className="flex items-center justify-between gap-2">
            <span className="opacity-70">Entry</span>
            <span className="font-mono truncate max-w-[140px]">
              {data.entry}
            </span>
          </div>
        )}

        {argKeys.length > 0 && (
          <div className="mt-1 text-[10px] opacity-80">
            <span className="opacity-70">Args:</span>{" "}
            <span className="font-mono">
              {primaryArgs}
              {hasMore ? ", …" : ""}
            </span>
          </div>
        )}
      </div>
    </NodeChrome>
  );
}
