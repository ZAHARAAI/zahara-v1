/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { NodeProps } from "reactflow";
import { NodeChrome } from "./NodeChrome";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
};

export function ModelNode({ data }: NodeProps<any>) {
  const providerKey = data?.provider as string | undefined;
  const providerLabel =
    (providerKey && PROVIDER_LABEL[providerKey]) || providerKey || "Model";

  return (
    <NodeChrome title={data?.title || "Model"}>
      <div className="space-y-1 text-[11px] leading-snug">
        <div className="flex items-center justify-between gap-2">
          <span className="opacity-70">Provider</span>
          <span className="font-mono truncate max-w-[120px]">
            {providerLabel}
          </span>
        </div>

        {data?.model && (
          <div className="flex items-center justify-between gap-2">
            <span className="opacity-70">Model</span>
            <span className="font-mono truncate max-w-[140px]">
              {data.model}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="opacity-70">Temperature</span>
          <span className="font-mono">
            {typeof data?.temperature === "number"
              ? data.temperature.toFixed(2)
              : "0.70"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="opacity-70">Max Tokens</span>
          <span className="font-mono">
            {typeof data?.maxTokens === "number"
              ? data.maxTokens.toFixed(2)
              : "800"}
          </span>
        </div>

        {data?.prompt && (
          <div className="mt-1 text-[10px] max-w-[230px] italic line-clamp-2 opacity-80">
            “{data.prompt}”
          </div>
        )}
      </div>
    </NodeChrome>
  );
}
