/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

export function ModelNode({ data }: NodeProps<any>) {
  return (
    <NodeChrome title={data?.title || "Model"}>
      <div>
        Provider: <span className="font-mono">{data?.provider}</span>
      </div>
      <div>
        Model: <span className="font-mono">{data?.model}</span>
      </div>
      <div>
        Temp: <span className="font-mono">{data?.temperature}</span>
      </div>
    </NodeChrome>
  );
}
