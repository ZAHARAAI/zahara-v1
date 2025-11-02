/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

export function StartNode({ data }: NodeProps<any>) {
  return (
    <NodeChrome title={data?.title || "Start"}>
      <div>
        Trigger: <span className="font-mono">{data?.trigger || "manual"}</span>
      </div>
    </NodeChrome>
  );
}
