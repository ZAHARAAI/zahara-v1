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
      router.push(`/pro?flowId=${encodeURIComponent(flowId)}`);
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
            {"provider" in (selected.data || {}) && (
              <Select
                label="Provider"
                value={(selected.data as any).provider || "openai"}
                onChange={(e: any) =>
                  updateNodeData({ provider: e.target.value as any })
                }
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
