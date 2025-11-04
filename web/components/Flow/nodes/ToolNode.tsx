/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

export function ToolNode({ data }: NodeProps<any>) {
  return (
    <NodeChrome title={data?.title || "Tool"}>
      <div>
        Name: <span className="font-mono">{data?.toolName}</span>
      </div>
    </NodeChrome>
  );
}
