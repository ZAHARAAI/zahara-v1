/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

export function OutputNode({ data }: NodeProps<any>) {
  return (
    <NodeChrome title={data?.title || "Output"}>
      <div>
        Sink: <span className="font-mono">{data?.sink}</span>
      </div>
    </NodeChrome>
  );
}
