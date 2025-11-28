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

const TABS = ["config", "prompt", "logs"] as const;
type Tab = (typeof TABS)[number];

export default function Inspector() {
  const { nodes, selectedId, setNodes, flowId, flowName } = useFlowStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("config");

  const selected = useMemo(() => {
    return nodes.find((n) => n.id === selectedId);
  }, [nodes, selectedId]);

  const updateNodeData = (patch: Partial<AnyNodeData>) => {
    if (!selected) return;
    const next = nodes.map((n) =>
      n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n
    );
    setNodes(next as any);
  };

  const openInPro = () => {
    if (!flowId) {
      // still allow opening Pro without flow
      router.push("/pro");
    } else {
      router.push(
        `/pro?flowId=${encodeURIComponent(flowId)}&name=${encodeURIComponent(
          flowName || ""
        )}`
      );
    }
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--panel))]">
      <div className="border-b border-[hsl(var(--border))] px-3 py-2 text-xs font-medium">
        Inspector {flowName ? `– ${flowName}` : ""}
      </div>

      <div className="flex border-b border-[hsl(var(--border))] text-xs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-2 py-1 ${
              t === tab
                ? "bg-[hsl(var(--muted))] font-medium"
                : "hover:bg-[hsl(var(--muted))]/50"
            }`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        {!selected && (
          <div className="opacity-60">Select a node to edit its config.</div>
        )}

        {selected && tab === "config" && (
          <>
            <Input
              label="Title"
              value={selected.data?.title ?? ""}
              onChange={(e) => updateNodeData({ title: e.target.value } as any)}
              placeholder="Node title"
            />

            {/* Start data */}
            {"trigger" in (selected.data || {}) && (
              <Select
                label="Trigger"
                value={(selected.data as any).trigger || "http"}
                onChange={(v: string) => updateNodeData({ trigger: v as any })}
                options={[
                  ["http", "Http"],
                  ["schedule", "Schedule"],
                  ["manual", "Manual"],
                ]}
              />
            )}

            {/* Model data */}
            {"provider" in (selected.data || {}) && (
              <Select
                label="Provider"
                value={(selected.data as any).provider || "openai"}
                onChange={(v: string) => updateNodeData({ provider: v as any })}
                options={[
                  ["openai", "OpenAI"],
                  ["anthropic", "Anthropic"],
                  ["groq", "Groq"],
                ]}
              />
            )}
            {"model" in (selected.data || {}) && (
              <Input
                label="Model"
                value={(selected.data as any).model || ""}
                onChange={(e) =>
                  updateNodeData({ model: e.target.value } as any)
                }
              />
            )}
            {"temperature" in (selected.data || {}) && (
              <Input
                label="Temperature"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={(selected.data as any).temperature || ""}
                onChange={(e) =>
                  updateNodeData({ temperature: Number(e.target.value) } as any)
                }
              />
            )}
            {"maxTokens" in (selected.data || {}) && (
              <Input
                label="Max Tokens"
                type="number"
                step="1"
                min="1"
                value={(selected.data as any).maxTokens || ""}
                onChange={(e) =>
                  updateNodeData({ maxTokens: Number(e.target.value) } as any)
                }
              />
            )}

            {/* Tool Data */}
            {"toolName" in (selected.data || {}) && (
              <Input
                label="Tool Name"
                value={(selected.data as any).toolName || ""}
                onChange={(e) =>
                  updateNodeData({ toolName: e.target.value } as any)
                }
              />
            )}
            {"mode" in (selected.data || {}) && (
              <Select
                label="Mode"
                value={(selected.data as any).mode || "mcp"}
                onChange={(v: string) => updateNodeData({ mode: v as any })}
                options={[
                  ["mcp", "MCP"],
                  ["standard", "Standard"],
                ]}
              />
            )}
            {"entry" in (selected.data || {}) && (
              <Input
                label="Entry"
                value={(selected.data as any).entry || ""}
                onChange={(e) =>
                  updateNodeData({ entry: e.target.value } as any)
                }
              />
            )}

            {/* Output Data */}
            {"sink" in (selected.data || {}) && (
              <Select
                label="Sink"
                value={(selected.data as any).sink || "console"}
                onChange={(v: string) => updateNodeData({ sink: v as any })}
                options={[
                  ["console", "Console"],
                  ["webhook", "Webhook"],
                  ["file", "File"],
                ]}
              />
            )}
          </>
        )}

        {selected && tab === "prompt" && (
          <Textarea
            label="Prompt"
            value={(selected.data as any).prompt || ""}
            onChange={(e) => updateNodeData({ prompt: e.target.value } as any)}
            rows={8}
          />
        )}

        {selected && tab === "logs" && (
          <div className="text-xs opacity-70">
            Logs for this node will appear here during execution.
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-[hsl(var(--border))] p-3">
        <Button onClick={openInPro}>Open in Pro</Button>
      </div>
    </div>
  );
}
