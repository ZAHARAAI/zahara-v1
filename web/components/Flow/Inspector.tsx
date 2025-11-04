/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFlowStore } from "./store";
import type { AnyNodeData } from "./types";

const TABS = ["config", "prompt", "logs"] as const;
type Tab = (typeof TABS)[number];

export default function Inspector() {
  const { nodes, selectedId, setNodes, flowId } = useFlowStore();
  const [tab, setTab] = useState<Tab>("config");
  const router = useRouter();

  const idx = useMemo(
    () => nodes.findIndex((n) => n.id === selectedId),
    [nodes, selectedId]
  );
  const selected = idx >= 0 ? nodes[idx] : undefined;

  const patch = (partial: Partial<AnyNodeData>) => {
    if (idx < 0) return;
    const copy = [...nodes];
    copy[idx] = {
      ...copy[idx],
      data: { ...(copy[idx].data as any), ...partial },
    } as any;
    setNodes(copy as any);
  };

  const openInPro = () => {
    const q = flowId ? `?flowId=${flowId}` : "";
    router.push("/pro" + q);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-[hsl(var(--border))]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-[hsl(var(--accent))]" : ""
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 text-sm flex-1 overflow-auto">
        {!selected && (
          <div className="opacity-60">
            Select a node to edit its properties.
          </div>
        )}

        {selected && tab === "config" && (
          <div className="space-y-3">
            <Input
              label="Title"
              value={(selected.data as any)?.title || ""}
              onChange={(e) => patch({ title: e.target.value })}
            />

            {selected.type === "start" && (
              <Select
                label="Trigger"
                value={(selected.data as any)?.trigger || "manual"}
                options={[
                  ["manual", "Manual"],
                  ["http", "HTTP"],
                  ["schedule", "Schedule"],
                ]}
                onChange={(v) => patch({ trigger: v as any })}
              />
            )}

            {selected.type === "model" && (
              <>
                <Select
                  label="Provider"
                  value={(selected.data as any)?.provider || "openai"}
                  options={[
                    ["openai", "OpenAI"],
                    ["anthropic", "Anthropic"],
                    ["groq", "Groq"],
                  ]}
                  onChange={(v) => patch({ provider: v as any })}
                />
                <Input
                  label="Model"
                  value={(selected.data as any)?.model || ""}
                  onChange={(e) => patch({ model: e.target.value })}
                />
                <Input
                  label="Temperature"
                  type="number"
                  step="0.1"
                  value={(selected.data as any)?.temperature ?? 0.5}
                  onChange={(e) =>
                    patch({ temperature: Number(e.target.value) })
                  }
                />
              </>
            )}

            {selected.type === "tool" && (
              <Input
                label="Tool Name"
                value={(selected.data as any)?.toolName || ""}
                onChange={(e) => patch({ toolName: e.target.value })}
              />
            )}

            {selected.type === "output" && (
              <Select
                label="Sink"
                value={(selected.data as any)?.sink || "console"}
                options={[
                  ["console", "Console"],
                  ["webhook", "Webhook"],
                  ["file", "File"],
                ]}
                onChange={(v) => patch({ sink: v as any })}
              />
            )}
          </div>
        )}

        {selected && tab === "prompt" && selected.type === "model" && (
          <Textarea
            label="Prompt"
            value={(selected.data as any)?.prompt || ""}
            onChange={(e) => patch({ prompt: e.target.value })}
          />
        )}

        {selected && tab === "logs" && (
          <div className="text-xs opacity-70">
            Logs will appear during execution (Milestone 2).
          </div>
        )}
      </div>

      <div className="mt-auto p-3 border-t border-[hsl(var(--border))] flex items-center gap-2">
        <Button onClick={openInPro}>Open in Pro</Button>
      </div>
    </div>
  );
}
